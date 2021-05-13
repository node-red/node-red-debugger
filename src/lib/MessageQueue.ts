import {MessageEvent} from "./types"

export class MessageQueue {
    queueName: string;
    private previousName: string;
    private nextName: string;
    head: MessageEvent;
    tail: MessageEvent;
    length: number;

    constructor(queueName:string) {
        this.queueName = queueName;
        this.previousName = `previousBy${queueName}`
        this.nextName = `nextBy${queueName}`
        this.length = 0;
    }
    enqueue(event:MessageEvent) {
        if (!this.head) {
            this.head = event;
        }
        event[this.previousName] = this.tail;
        if (this.tail) {
            this.tail[this.nextName] = event;
        }
        this.tail = event;
        this.length++;
    }
    next():MessageEvent {
        const result = this.head;
        if (result) {
            this.remove(result);
            this.length--;
        }
        return result;
    }
    peek():MessageEvent {
        return this.head;
    }
    get(id:number):MessageEvent {
        let p = this.head;
        while(p) {
            if (p.id === id) {
                return p;
            }
            p = p[this.nextName]
        }
    }
    remove(event:MessageEvent) {
        const previousEvent = event[this.previousName];
        const nextEvent = event[this.nextName];
        if (previousEvent) {
            previousEvent[this.nextName] = nextEvent;
        } else {
            this.head = nextEvent;
        }
        if (nextEvent) {
            nextEvent[this.previousName] = previousEvent;
        } else {
            this.tail = previousEvent;
        }
        this.length--;
    }
    *[Symbol.iterator]() {
        let p = this.head;
        while(p) {
            yield p;
            p = p[this.nextName];
        }
    }
    dump():string {
        let result = `MessageQueue ${this.queueName} [${this.length}]
  head: ${this.head.id}
  tail: ${this.tail.id}
  list: `;
        let p = this.head;
        while(p) {
            result = result + p.id;
            p = p[this.nextName];
            if (p) {
                result += " > ";
            }
        }
        return result

    }
}
