import {ReceiveEvent, SendEvent, EventCallback} from "../nr-types"

export interface MessageEvent {
    id: number;
    event: SendEvent | ReceiveEvent;
    location: string;
    done: EventCallback;
    nextByLocation: MessageEvent;
    previousByLocation: MessageEvent;
    nextByTime: MessageEvent;
    previousByTime: MessageEvent;
}

/**
 * Triggered when the debugger is paused
 * @param reason why the debugger paused: 'breakpoint' or 'manual'
 * @param data any other data associated with the event
 * @param breakpoint the breakpoint, if any, that triggered the pause
 */
export interface PausedEvent {
    reason: string,
    data?: any,
    breakpoint: string
}
