# Changelog

## [Unreleased]

## [0.1.1] - 2026-11-20

- Safe Z must clear the sensor Z by 2 mm and, on a homed Grbl range, stay inside
  Z travel (`$132`); the pull-off check follows `$23`'s Z homing direction and
  applies when `$22` bit 0 enables homing (grblHAL's `$22=3/5/7` included). A
  Machine Z range setting (Grbl / Other) replaces guessing from positions: with
  homing off or Other, only the sensor clearance is checked, and a note next to
  the wizard buttons says so. A sensor Z with no room above it is reported as a
  sensor problem, and a positive one points at Machine Z range.
- The Settings and G-code sections show a disclosure triangle, a pointer cursor
  and a keyboard focus outline under CNCjs's stylesheet, whose Bootstrap 3
  normalize hides the browser's own marker. The Machine Z range select is as
  tall as the fields beside it.
- BitZero on a Grbl reporting inches sets the machine's units once at the end
  instead of capturing them at run time; G20 machines no longer get a second
  `G20`.

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
  uses its thickness settings instead of falling back to 13 / 15.5 mm; BitZero
  on a Grbl reporting inches puts the operator's units mode back at the end
  instead of leaving the machine in G20; the tool length wizard travels at a
  Safe Z setting in machine mm (default -10) checked against the homing pull-off,
  where gSender used -0.5 mm on inch-reporting machines (its inch value run
  under G21, inside the pull-off of the Z switch).
