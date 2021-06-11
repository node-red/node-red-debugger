# Node-RED Flow Debugger

This module is a Plugin for Node-RED 2.x. It provides a flow debugger with the following
features:

 - set breakpoints on node inputs or outputs
 - pause the runtime manually or when a message arrives at a breakpoint
 - once paused you can:
   - inspect the queued up messages
   - step forward individual messages
   - drop messages

## Installation

Install this module in your Node-RED user directory or via the Palette Manager
then restart Node-RED

    npm install node-red-debugger


## Usage

The Flow Debugger adds a new sidebar tab in the editor. Select it from the dropdown
menu.

By default, the debugger is disabled. Click the 'disabled' toggle button to enable it.

The sidebar has two sections - a list of the breakpoints you have set and a list
of any messages queued up in the runtime.

### Working with breakpoints

With the debugger enabled, when you hover over a node's port a breakpoint indicator
will appear. Move your mouse over the indicator and click once - it will turn solid blue
and an entry will appear in the sidebar.

If you click on it again, the breakpoint will be deactivated but remain in place (light blue).

Clicking on it again will remove the breakpoint entirely (dotted outline).

You can also deactive a breakpoint using its checkbox in the sidebar, and remove it by
clicking the `x` button.

### Pausing the runtime

The runtime will by paused whenever a message arrives at an active breakpoint. You
can also manually pause the runtime using the pause button in the sidebar.

Once paused, the flow will show how many messages are queued up at each node input
and output. Those messages will also be listed in the sidebar - in the order the
runtime will process them.

If you click the step button at the top of the sidebar, the runtime will process
the next message in the list. You can step individual messages by clicking the
step button that appears when you hover over the message.

You can also delete any message from the queue by clicking its delete button. This
will prevent the message from passing any further in the flow.

You can click the play button to resume the flows.


## Limitations

 - Due to the way Subflows work, breakpoints on Subflow outputs will be ignored

## Roadmap

 - Set conditions on individual breakpoints
 - Allow queued messages to be edited
 - Pause only selected nodes/flows/groups


## Development

This plugin has been developed using TypeScript. This means that when running
from the source code rather than npm, it must first be built.

    git clone https://github.com/node-red/node-red-debugger.git
    cd node-red-debugger
    npm install
    npm run build

This will generate all of the plugin files in the `dist` folder - which is where
Node-RED will expect to load the files from.


Then, in your Node-RED user directory (`~/.node-red`) run:

    npm install `<path to node-red-debugger directory>`

### Themeing

The Debugger sidebar will use the active Node-RED theme. For the breakpoints
drawn within the flow workspace, the following CSS variables will be used if they
are set by the active theme.

 - `--red-ui-flow-debugger-breakpoint-fill`
 - `--red-ui-flow-debugger-breakpoint-stroke`
 - `--red-ui-flow-debugger-breakpoint-active-fill`
 - `--red-ui-flow-debugger-breakpoint-active-stroke`
 - `--red-ui-flow-debugger-breakpoint-inactive-fill`
 - `--red-ui-flow-debugger-breakpoint-inactive-stroke`
 - `--red-ui-flow-debugger-breakpoint-label`
 - `--red-ui-flow-debugger-breakpoint-label-active`
