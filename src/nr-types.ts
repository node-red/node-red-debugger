export type SendEvent = {
    msg: any,
    source: {
        id: string,
        node: any,
        port: number
    },
    destination: {
        id: string,
        node: any,
    },
    cloneMessage: boolean
}

export type ReceiveEvent = {
    msg: any,
    destination: {
        id: string,
        node: any,
    }
}

export type EventCallback = (error?: any) => any;
