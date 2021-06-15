import {Debugger,State} from "./lib/debugger"
import {PausedEvent} from "./lib/types"
import {Location} from "./lib/location"

module.exports = (RED:any) => {

    const apiRoot = "/flow-debugger";

    RED.plugins.registerPlugin("node-red-debugger", {
        onadd: () => {

            const flowDebugger = new Debugger(RED);
            const routeAuthHandler = RED.auth.needsPermission("flow-debugger.write");


            function publishState() {
                RED.comms.publish("flow-debugger/state",flowDebugger.getState(), true)
            }
            publishState();

            flowDebugger.on("paused", (event:PausedEvent) => {
                RED.comms.publish("flow-debugger/paused",event)
            })

            flowDebugger.on("resumed", (event:PausedEvent) => {
                RED.comms.publish("flow-debugger/resumed",event)
            })
            flowDebugger.on("messageQueued", (event) => {
                // msg = RED.util.encodeObject(msg,{maxLength:debuglength});
                // RED.comms.publish("debug",msg);
                event.msg = RED.util.encodeObject({msg:event.msg}, {maxLength: 100});
                RED.comms.publish("flow-debugger/messageQueued",event)
            });
            flowDebugger.on("messageDispatched", (event) => {
                RED.comms.publish("flow-debugger/messageDispatched",event)
            });
            // flowDebugger.on("step", (event) => {
            //
            // });

            RED.httpAdmin.get(`${apiRoot}/state`, (_:any, res:any) => {
                res.json(flowDebugger.getState());
            });

            RED.httpAdmin.put(`${apiRoot}/state`, routeAuthHandler, (req:any, res:any) => {
                if (req.body.hasOwnProperty("enabled")) {
                    const enabled = !!req.body.enabled;
                    let stateChanged = false;
                    if (enabled && flowDebugger.state === State.DISABLED) {
                        flowDebugger.enable();
                        stateChanged = true;
                    } else if (!enabled && flowDebugger.state !== State.DISABLED) {
                        flowDebugger.disable();
                        stateChanged = true;
                    }
                    if (stateChanged) {
                        publishState();
                    }
                }


                res.sendStatus(200)
            });

            RED.httpAdmin.get(`${apiRoot}/breakpoints`, routeAuthHandler, (_:any, res:any) => {
                res.json(flowDebugger.getBreakpoints());
            })
            RED.httpAdmin.put(`${apiRoot}/breakpoints/:id`, routeAuthHandler, (req:any, res:any) => {
                flowDebugger.setBreakpointActive(req.params.id, req.body.active)
                publishState();
                res.sendStatus(200)
            })
            RED.httpAdmin.delete(`${apiRoot}/breakpoints/:id`, routeAuthHandler, (req:any, res:any) => {
                flowDebugger.clearBreakpoint(req.params.id)
                publishState();
                res.sendStatus(200)
            })
            RED.httpAdmin.post(`${apiRoot}/breakpoints`, routeAuthHandler, (req:any, res:any) => {
                // req.body.location
                const breakpointId = flowDebugger.setBreakpoint(new Location(req.body.id,req.body.path,req.body.portType,req.body.portIndex))
                res.json(flowDebugger.getBreakpoint(breakpointId));
            })
            RED.httpAdmin.get(`${apiRoot}/messages`, routeAuthHandler, (_:any, res:any) => {
                res.json(Array.from(flowDebugger.getMessageQueue()).map(m => {
                    const result = {
                        id: m.id,
                        location: m.location,
                        destination: undefined,
                        msg: RED.util.encodeObject({msg:m.event.msg}, {maxLength: 100})
                    }
                    if (m.event.hasOwnProperty('source')) {
                        // SendEvent - so include the destination location id
                        result.destination = m.event.destination.id+"[i][0]"
                    }
                    return result;
                }))
            });
            RED.httpAdmin.get(`${apiRoot}/messages/:id`, routeAuthHandler, (req:any, res:any) => {
                const id = req.params.id;
                const messageEvent = flowDebugger.getMessageQueue().get(parseInt(id,10));
                if (messageEvent) {
                    const result = {
                        id: messageEvent.id,
                        location: messageEvent.location,
                        destination: undefined,
                        msg: RED.util.encodeObject({msg:messageEvent.event.msg}, {maxLength: 100})
                    }
                    if (messageEvent.event.hasOwnProperty('source')) {
                        // SendEvent - so include the destination location id
                        result.destination = messageEvent.event.destination.id+"[i][0]"
                    }
                    res.json(result)
                } else {
                    res.sendStatus(404);
                }
            });
            RED.httpAdmin.delete(`${apiRoot}/messages/:id`, routeAuthHandler, (req:any, res:any) => {
                flowDebugger.deleteMessage(parseInt(req.params.id,10));
                res.sendStatus(200);
            });
            RED.httpAdmin.post(`${apiRoot}/pause`, routeAuthHandler, (_:any, res:any) => {
                flowDebugger.pause();
                res.sendStatus(200);
            });
            RED.httpAdmin.post(`${apiRoot}/step`, routeAuthHandler, (req:any, res:any) => {
                let stepMessage = null;
                if (req.body && req.body.message) {
                    stepMessage = req.body.message;
                }
                flowDebugger.step(stepMessage);
                res.sendStatus(200);
            });

            RED.httpAdmin.post(`${apiRoot}/resume`, routeAuthHandler, (_:any, res:any) => {
                flowDebugger.resume();
                res.sendStatus(200);
            });
        }
    })
}
/*

/flow-debugger/enable
/flow-debugger/disable
/flow-debugger/breakpoint



*/
