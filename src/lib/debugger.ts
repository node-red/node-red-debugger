import * as Location from "./location"
import { Breakpoint, PausedEvent, MessageEvent } from "./types"
import { ReceiveEvent, SendEvent, EventCallback } from "../nr-types"
import { MessageQueue } from "./MessageQueue"
import { EventEmitter } from "events"

const DEBUGGER_PAUSED = Symbol("node-red-debugger: paused");

type DebuggerConfig = {
    breakpointAction: "pause-all" | "pause-bp"
}
interface MessageQueueTable {
    [Key: string]: MessageQueue
}

let BREAKPOINT_ID = 1;

export class Debugger extends EventEmitter {

    RED: any;
    enabled: boolean;
    pausedLocations: Set<string>;
    breakpoints: Map<string, Breakpoint>;
    breakpointsByLocation: Map<string, Breakpoint>;
    eventNumber: number;
    queuesByLocation: MessageQueueTable;
    messageQueue: MessageQueue;
    config: DebuggerConfig;

    // Events:
    //  paused / resumed

    constructor(RED: any) {
        super();
        this.config = {
            breakpointAction: "pause-all"
        };
        this.RED = RED;
        this.enabled = false;
        this.breakpoints = new Map();
        this.pausedLocations = new Set();
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
        if (this.isNodePaused(location.id)) {
            this.queueEvent(location,event,done);
        } else {
            if (event.msg && event.msg[DEBUGGER_PAUSED]) {
                this.pause({
                    reason: "step",
                    node: location.id
                })
                this.queueEvent(location,event,done);
            } else {
                const bp = this.breakpointsByLocation.get(breakpointId);
                if (bp && bp.active) {
                    this.pause({
                        reason: "breakpoint",
                        node: location.id,
                        breakpoint: bp.id
                    })
                    this.queueEvent(location,event,done);
                } else {
                    done();
                }
            }
        }
    }

    enable() {
        this.log("Enabled");
        this.enabled = true;
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
            if (receiveEvent.destination.node.type === "inject") {
                // Never pause an Inject node's internal receive event
                done();
                return;
            }
            if (isNodeInSubflowModule(receiveEvent.destination.node)) {
                // Inside a subflow module - don't pause the event
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
        this.enabled = false;
        this.RED.hooks.remove("*.flow-debugger");
        this.pausedLocations.clear();
        this.drainQueues(true);
    }
    pause(event?:PausedEvent) {
        if (this.enabled) {
            let logReason:string;
            if (event) {
                if (this.config.breakpointAction === "pause-all") {
                    this.pausedLocations.clear();
                    this.pausedLocations.add("*");
                } else {
                    this.pausedLocations.add(event.node);
                }
                if (event.reason === "breakpoint") {
                    logReason = "@"+this.breakpoints.get(event.breakpoint).location.toString()
                } else if (event.reason === "step") {
                    logReason = "@"+event.node
                }
                event.pausedLocations = [...this.pausedLocations];
            } else {
                // Manual pause
                this.pausedLocations.clear();
                this.pausedLocations.add("*");
                logReason = "manual";
            }
            this.log(`Flows paused: ${logReason}`);
            this.emit("paused",  event || { reason: "manual" })
        }
    }
    resume(nodeId?:string) {
        if (this.pausedLocations.size === 0) {
            return;
        }
        if (!nodeId || nodeId === "*") {
            console.log("resume - clear all locations")
            this.pausedLocations.clear();
        } else if (nodeId && this.pausedLocations.has(nodeId)) {
            this.pausedLocations.delete(nodeId);
        } else {
            // Nothing has been unpaused
            return;
        }
        this.log("Flows resumed");
        this.emit("resumed", { node: nodeId })
        this.drainQueues();
    }
    deleteMessage(messageId:number) {
        const nextEvent = this.messageQueue.get(messageId);
        if (nextEvent) {
            this.messageQueue.remove(nextEvent);
            const nextEventLocation = nextEvent.location.toString();
            this.queuesByLocation[nextEventLocation].remove(nextEvent);
            const queueDepth = this.queuesByLocation[nextEventLocation].length;
            if (queueDepth === 0) {
                delete this.queuesByLocation[nextEventLocation]
            }
            this.emit("messageDispatched", { id: nextEvent.id, location: nextEventLocation, depth: queueDepth })
            // Call done with false to prevent any further processing
            nextEvent.done(false);
        }
    }
    private isNodePaused(nodeId:string) {
        return this.pausedLocations.has("*") || this.pausedLocations.has(nodeId);
    }
    private drainQueues(quiet?:boolean) {
        for (const nextEvent of this.messageQueue) {
            const eventNodeId = nextEvent.location.id;
            if (!this.isNodePaused(eventNodeId)) {
                const nextEventLocation = nextEvent.location.toString();
                this.queuesByLocation[nextEventLocation].remove(nextEvent);
                const queueDepth = this.queuesByLocation[nextEventLocation].length;
                if (queueDepth === 0) {
                    delete this.queuesByLocation[nextEventLocation]
                }
                if (!quiet) {
                    this.emit("messageDispatched", { id: nextEvent.id, location: nextEventLocation, depth: queueDepth })
                }
                if (nextEvent.event.msg[DEBUGGER_PAUSED]) {
                    delete nextEvent.event.msg[DEBUGGER_PAUSED];
                }
                nextEvent.done();
                this.messageQueue.remove(nextEvent);
            }
        }
    }
    setBreakpoint(location:Location.Location): string {
        const bp:Breakpoint = {
            id: (BREAKPOINT_ID++)+"",
            location,
            active: true,
            mode: "all"
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
        if (this.enabled) {
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
                const nextEventLocation = nextEvent.location.toString();
                this.log("Step: "+nextEventLocation);

                this.queuesByLocation[nextEventLocation].remove(nextEvent);
                const queueDepth = this.queuesByLocation[nextEventLocation].length;
                if (queueDepth === 0) {
                    delete this.queuesByLocation[nextEventLocation]
                }
                nextEvent.event.msg[DEBUGGER_PAUSED] = true;
                this.emit("messageDispatched", { id: nextEvent.id, location: nextEventLocation, depth: queueDepth })
                nextEvent.done();
            }
        }
    }

    setConfig(newConfig: object): boolean {
        let changed = false;
        for (const key in this.config) {
            if (newConfig.hasOwnProperty(key) && this.config[key] !== newConfig[key]) {
                changed = true;
                this.config[key] = newConfig[key];
            }
        }
        return changed;
    }

    getState(): object {
        if (!this.enabled) {
            return { enabled: false }
        }
        return {
            enabled: true,
            pausedLocations: [...this.pausedLocations],
            config: this.config,
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
        if (!this.enabled) {
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
    private queueEvent(location:Location.Location, event:SendEvent|ReceiveEvent, done:EventCallback) {
        const locationId = location.toString();
        if (!this.queuesByLocation[locationId]) {
            this.queuesByLocation[locationId] = new MessageQueue("Location");
        }
        const messageEvent:MessageEvent = {
            id: this.eventNumber++,
            event,
            location,
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
