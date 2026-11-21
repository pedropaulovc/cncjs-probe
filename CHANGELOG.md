# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-20

- First release: gSender's Probe tool as a CNCjs custom widget, ported from
  gSender e73082a. Standard Block, AutoZero, Z Probe, 3D Probe and BitZero touch
  plates; Z, XYZ, XY, X and Y routines from any stock corner with tool diameter
  compensation; gSender's tool length wizard against a fixed sensor. The G-code
  matches gSender's for the same settings, and runs in the machine's units.
- A toolsetter touch (`Pn:T`, as FluidNC reports it) counts like a probe touch
  (`Pn:P`): it passes the connection test, and the indicator names the input.
- Shows the G-code before it runs; keeps settings in the browser; follows the
  port selected in CNCjs and only starts when the controller is idle and no
  program is running.
- Fixes over gSender for running under CNCjs: on a Grbl reporting inches
  (`$13=1`), BitZero centring and the tool length wizard's saved position and
  `TOOL_OFFSET` use mm, as gSender's server makes them; on G20 machines BitZero
  uses its thickness settings instead of falling back to 13 / 15.5 mm.
