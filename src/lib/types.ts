import {ReceiveEvent, SendEvent, EventCallback} from "../nr-types"
import * as Location from "./location"

export interface MessageEvent {
    id: number;
    event: SendEvent | ReceiveEvent;
    location:  Location.Location;
    done: EventCallback;
    nextByLocation: MessageEvent;
    previousByLocation: MessageEvent;
    nextByTime: MessageEvent;
    previousByTime: MessageEvent;
}

/**
 * Triggered when the debugger is paused
 * @param reason why the debugger paused: 'breakpoint', 'step', 'manual'
 * @param node the id of the node that is paused
 * @param breakpoint the breakpoint, if any, that triggered the pause
 * @param data any other data associated with the event
 */
export interface PausedEvent {
    reason: string,
    node?: string,
    breakpoint?: string,
    pausedLocations?: string[],
    data?: any
}

export interface Breakpoint {
    id: string,
    location: Location.Location,
    active: boolean,
    mode: "all" | "flow" | "node"
}
