import * as Location from "./location"
import { PausedEvent, MessageEvent } from "./types"
import { ReceiveEvent, SendEvent, EventCallback } from "../nr-types"
import { MessageQueue } from "./MessageQueue"
import { EventEmitter } from "events"

export enum State {
    DISABLED,
    ENABLED,
    PAUSED
}

interface MessageQueueTable {
    [Key: string]: MessageQueue
}

interface Breakpoint {
    id: string,
    location: Location.Location,
    active: boolean
}

let BREAKPOINT_ID = 1;

export class Debugger extends EventEmitter {

    RED: any;
    state: State;
    breakpoints: Map<string, Breakpoint>;
    breakpointsByLocation: Map<string, Breakpoint>;
    eventNumber: number;
    queuesByLocation: MessageQueueTable;
    messageQueue: MessageQueue;

    // Events:
    //  paused / resumed

    constructor(RED: any) {
        super();
        this.RED = RED;
        this.state = State.DISABLED;
        this.breakpoints = new Map();
        this.breakpointsByLocation = new Map();
        this.queuesByLocation = {};
        this.messageQueue = new MessageQueue("Time");
        this.eventNumber = 0;
    }
    log(message:string) {
        this.RED.log.info(`[flow-debugger] ${message}`)
    }

    private checkLocation(location:Location.Location, event:SendEvent|ReceiveEvent, done:EventCallback) {
        const breakpointId:string = location.getBreakpointLocation();
        const locationId:string = location.toString();
        if (this.state === State.ENABLED) {

            const bp = this.breakpointsByLocation.get(breakpointId);
            if (bp && bp.active) {
                this.pause({
                    reason: "breakpoint",
                    breakpoint: bp.id
                })
                this.queueEvent(locationId,event,done);
            } else {
                done();
            }
        } else if (this.state === State.PAUSED) {
            this.queueEvent(locationId,event,done);
        }
    }

    enable() {
        this.log("Enabled");
        this.state = State.ENABLED;
        this.RED.hooks.add("preRoute.flow-debugger", (sendEvent:SendEvent, done:EventCallback) => {
            if (isNodeInSubflowModule(sendEvent.source.node)) {
                // Inside a subflow module - don't pause the event
                done();
                return;
            }
            if (sendEvent.source.node._flow.TYPE !== "flow" && sendEvent.source.node.id === sendEvent.source.node._flow.id) {
                // This is the subflow output which, in the current implementation
                // means the message is actually about to be routed to the first node
                // inside the subflow, not the output of actual subflow.
                done();
                return;
            }

            if (sendEvent.cloneMessage) {
                sendEvent.msg = this.RED.util.cloneMessage(sendEvent.msg);
                sendEvent.cloneMessage = false;
            }
            const eventLocation = Location.createLocation(sendEvent);
            // console.log("preRoute",eventLocation.toString());
            this.checkLocation(eventLocation, sendEvent, done);
        });
        this.RED.hooks.add("onReceive.flow-debugger", (receiveEvent:ReceiveEvent, done:EventCallback) => {
            if (this.state === State.PAUSED && receiveEvent.destination.node.type === "inject") {
                // Inside a subflow module - don't pause the event
                done();
                return;
            }
            if (isNodeInSubflowModule(receiveEvent.destination.node)) {
                done();
                return;
            }
            const eventLocation = Location.createLocation(receiveEvent);
            // console.log("onReceive",eventLocation.toString());
            this.checkLocation(eventLocation, receiveEvent, done);
        });
    }

    disable() {
        this.log("Disabled");
        this.state = State.DISABLED;
        this.RED.hooks.remove("*.flow-debugger");
        this.drainQueues(true);
    }
    pause(event?:PausedEvent) {
        if (this.state === State.ENABLED) {
            this.state = State.PAUSED;
            const logReason = event?("@"+this.breakpoints.get(event.breakpoint).location.toString()):"manual";
            this.log(`Flows paused: ${logReason}`);
            this.emit("paused", event||{ reason: "manual", breakpoint: null})
        }
    }
    resume() {
        if (this.state === State.PAUSED) {
            this.log("Flows resumed");
            this.state = State.ENABLED;
            this.emit("resumed", {})
            this.drainQueues();
        }
    }
    deleteMessage(messageId:number) {
        const nextEvent = this.messageQueue.get(messageId);
        if (nextEvent) {
            this.messageQueue.remove(nextEvent);
            this.queuesByLocation[nextEvent.location].remove(nextEvent);
            const queueDepth = this.queuesByLocation[nextEvent.location].length;
            if (queueDepth === 0) {
                delete this.queuesByLocation[nextEvent.location]
            }
            this.emit("messageDispatched", { id: nextEvent.id, location: nextEvent.location, depth: queueDepth })
            // Call done with false to prevent any further processing
            nextEvent.done(false);
        }
    }
    private drainQueues(quiet?:boolean) {
        let nextEvent:MessageEvent;
        do {
            nextEvent = this.messageQueue.next();
            if (nextEvent) {
                this.queuesByLocation[nextEvent.location].remove(nextEvent);
                const queueDepth = this.queuesByLocation[nextEvent.location].length;

                if (queueDepth === 0) {
                    delete this.queuesByLocation[nextEvent.location]
                }
                if (!quiet) {
                    this.emit("messageDispatched", { id: nextEvent.id, location: nextEvent.location, depth: queueDepth })
                }
                nextEvent.done();
            }
        } while (this.state !== State.PAUSED && nextEvent)
    }
    setBreakpoint(location:Location.Location): string {
        const bp = {
            id: (BREAKPOINT_ID++)+"",
            location,
            active: true
        }
        this.breakpoints.set(bp.id, bp);
        this.breakpointsByLocation.set(location.toString(), bp);
        return bp.id;
    }
    getBreakpoint(breakpointId: string) {
        return this.breakpoints.get(breakpointId);
    }
    setBreakpointActive(breakpointId: string, state: boolean) {
        const bp = this.breakpoints.get(breakpointId);
        if (bp) {
            bp.active = state
        }
    }

    clearBreakpoint(breakpointId: string) {
        const bp = this.breakpoints.get(breakpointId);
        if (bp) {
            this.breakpoints.delete(breakpointId);
            this.breakpointsByLocation.delete(bp.location.toString());
        }
    }

    getBreakpoints(): Breakpoint[] {
        return Array.from(this.breakpoints.values());
    }

    step(messageId?:number) {
        if (this.state === State.PAUSED) {
            let nextEvent:MessageEvent;
            if (messageId) {
                nextEvent = this.messageQueue.get(messageId);
                if (nextEvent) {
                    this.messageQueue.remove(nextEvent);
                }
            } else {
                nextEvent = this.messageQueue.next();
            }
            if (nextEvent) {

                this.log("Step: "+nextEvent.location.toString());

                this.queuesByLocation[nextEvent.location].remove(nextEvent);
                const queueDepth = this.queuesByLocation[nextEvent.location].length;
                if (queueDepth === 0) {
                    delete this.queuesByLocation[nextEvent.location]
                }
                this.emit("messageDispatched", { id: nextEvent.id, location: nextEvent.location, depth: queueDepth })
                nextEvent.done();
            }
        }
    }
    getState(): object {
        if (this.state === State.DISABLED) {
            return { enabled: false }
        }
        return {
            enabled: true,
            paused: this.state === State.PAUSED,
            breakpoints: this.getBreakpoints(),
            queues: this.getMessageQueueDepths()
        }
    }
    getMessageSummary() {
        return Array.from(this.messageQueue).map(m => {
            return {
                id: m.id,
                location: m.location
            }
        })
    }
    getMessageQueue(): MessageQueue {
        return this.messageQueue;
    }

    getMessageQueueDepths(): object {
        if (this.state === State.DISABLED) {
            return {};
        }
        const result = {};
        for (const [locationId, queue] of Object.entries(this.queuesByLocation)) {
            result[locationId] = { depth: queue.length }
        }
        return result;
    }


    dump():string {
        let result = `Debugger State
---
${this.messageQueue.dump()}
`;
        const locationIds = Object.keys(this.queuesByLocation);
        locationIds.forEach(id => {
            result += `---
Location: ${id}
${this.queuesByLocation[id].dump()}
`;
        })
        return result;
    }
    private queueEvent(locationId:string, event:SendEvent|ReceiveEvent, done:EventCallback) {
        if (!this.queuesByLocation[locationId]) {
            this.queuesByLocation[locationId] = new MessageQueue("Location");
        }
        const messageEvent:MessageEvent = {
            id: this.eventNumber++,
            event,
            location: locationId,
            done,
            nextByLocation: null,
            previousByLocation: null,
            nextByTime: null,
            previousByTime: null
        }
        this.queuesByLocation[locationId].enqueue(messageEvent);
        this.messageQueue.enqueue(messageEvent);
        const queuedEvent = {
            id: messageEvent.id,
            location: locationId,
            msg: event.msg,
            depth: this.queuesByLocation[locationId].length,
            destination: null,
        };
        if (event.hasOwnProperty('source')) {
            // SendEvent - so include the destination location id
            queuedEvent.destination = "/"+event.destination.id+"[i][0]"
        }
        this.emit("messageQueued", queuedEvent)
    }
}

const MODULE_TYPE_RE = /^module:/;

function isNodeInSubflowModule(node:any) {
    let f = node._flow;
    do {
        if (f.TYPE === "flow") {
            return false;
        }
        if (MODULE_TYPE_RE.test(f.TYPE)) {
            return true;
        }
        f = f.parent;
    } while(f && f.TYPE);
    return false;
}
