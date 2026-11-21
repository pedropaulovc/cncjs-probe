# cncjs-probe

A [CNCjs](https://github.com/cncjs/cncjs) custom widget for zeroing with a touch
plate and measuring tool length. It is a port of the Probe tool in
[gSender](https://github.com/Sienci-Labs/gsender) by Sienci Labs: the same touch
plates, routines and settings, and the same G-code, run by CNCjs instead.

- Touch plates: Standard Block, AutoZero, Z Probe, 3D Probe and BitZero.
- Routines: Z, XYZ, XY, X and Y (Z only for the Z Probe puck), from any of the
  four stock corners, with tool diameter compensation (Auto and Tip for AutoZero
  and BitZero).
- Tool length: probes the current tool on a fixed sensor at a machine position
  and stores the result in CNCjs as `global.toolchange.TOOL_OFFSET`, like
  gSender's tool length wizard.
- The G-code that will run is shown before you start it. Routines run in the
  machine's units (G20 or G21), and settings are kept in the browser.

## Toolsetter touches count

gSender reads only the probe input (`Pn:P`) when it checks that the circuit is
connected, so on a FluidNC machine with a toolsetter (`Pn:T`) its connection
test never passes, although `G38.2` stops on either input. In this widget either
input is a touch. The indicator says which one fired ("Probe" or "Toolsetter"),
and a toolsetter touch passes the connection test.

## Install

```sh
npm install cncjs-probe
cncjs --mount /probe:node_modules/cncjs-probe/web
```

In CNCjs, add a **Custom Widget** and set its URL to `/probe/`. Open a port and
the widget follows that machine. It works with CNCjs's Grbl controller (Grbl,
grblHAL and FluidNC).

Opened on its own (any static server on the `web` directory), the page only
previews the G-code.

FluidNC does not report `$132` (Z max travel), `$22` (homing) or `$13` (report
inches) in `$$`. Fill in **Settings → Z max travel ($132)** to use tool length;
without `$22` the Z probe distance is not limited by soft limits. The widget
assumes positions are reported in mm, so leave FluidNC's `report_inches` off.

## Safety

Probing moves the machine. Check the G-code preview, the selected corner and the
touch plate position before you start, keep a hand near the e-stop, and run the
first probe of a new setup slowly and well above the stock. The connection test
(on by default) makes you touch the plate to the tool before a routine can
start. **Stop** clears the remaining routine and puts the machine in feed hold;
reset or resume it from CNCjs.

## License

GNU General Public License v3.0; see [LICENSE](LICENSE). The probing routines,
settings and images come from gSender, Copyright (C) Sienci Labs Inc., under the
same license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
