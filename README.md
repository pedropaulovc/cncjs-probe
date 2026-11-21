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

The widget reads `$13` (report inches), `$22` (homing), `$27` (homing pull-off)
and `$132` (Z max travel) from CNCjs's copy of the controller settings. FluidNC
4.x reports them in `$$`; FluidNC 3.x reports none of them. On a controller that
does not report `$132`, fill in **Settings → Z max travel ($132)** to use tool
length; without `$22` the Z probe distance is not limited by soft limits, and
without `$13` positions are taken as mm.

Tool length travels between sensor and work at **Safe Z**, a machine Z in mm
(default -10, gSender's metric value). It must be at least 2 mm above the
sensor Z. With homing on (`$22=1`) and Grbl's homed range (machine Z from
`-$132` to 0), it must also stay inside Z travel and the homing pull-off (`$27`,
or 1 mm when unreported) away from the Z switch: below Z0 when Z homes up (the
default), above `-$132` when `$23` says it homes down. With homing off, or on a
FluidNC setup whose machine Z is positive, only the sensor clearance is checked
and the preview says so.

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
