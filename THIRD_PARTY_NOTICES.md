# Third-party notices

## gSender

cncjs-probe ports code and images from gSender by Sienci Labs Inc.

- Source: https://github.com/Sienci-Labs/gsender
- Commit: `e73082afb83ee2377ed2077537c45fec33efaba0`
- Copyright (C) 2021-2026 Sienci Labs Inc.
- License: GNU General Public License v3.0 (the license of this package; see
  `LICENSE`)

Each ported file starts with a header naming its upstream path. All were ported
from TypeScript/React to plain browser JavaScript; the G-code they produce is
unchanged, which `test/parity.test.mjs` checks against the upstream sources.

| cncjs-probe | gSender (`src/app/src/...` unless noted) |
| --- | --- |
| `web/lib/probing.js` | `lib/Probing.ts` |
| `web/lib/constants.js` | `lib/constants.ts`, `constants/index.ts` (the constants the Probe tool uses) |
| `web/lib/units.js` | `lib/units.ts` (unit conversions) |
| `web/lib/soft-limits.js` | `lib/SoftLimits.js` |
| `web/lib/probe-tool-length.js` | `wizards/probeToolLength.tsx` |
| `web/lib/probe-options.js` | `features/Probe/index.tsx` (routines, options, Run gating), `features/Probe/ProbeDiameter.tsx` (diameter list), `lib/toolChangeUtils.ts` (`getProbeSettings`), `store/defaultState/index.ts` (defaults), `src/server/controllers/Grbl/GrblController.js` (`gcode:safe`) |
| `web/app.js`, `web/index.html` | behaviour of `features/Probe/Probe.tsx`, `RunProbe.tsx`, `ProbeCircuitStatus.tsx`, `ProbeDiameter.tsx`, `ProbeImage.tsx` and the Probe section of `features/Config/assets/SettingsMenu.ts` |
| `web/assets/*.gif` | `features/Probe/assets/*.gif` (unmodified) |

Changes from gSender: touch detection also counts the toolsetter input
(`Pn:T`); the widget talks to CNCjs over its socket.io and passes the
`programFeedrate`/`spindleRate` macro values CNCjs lacks; when Grbl reports
inches (`$13=1`), BitZero and tool length scale the positions they capture to
mm, which gSender's server does for every routine and CNCjs does not
(`web/lib/cncjs-adapt.js`), and BitZero then restores the operator's units mode
at the end instead of leaving G20; on G20 machines BitZero uses its thickness
settings instead of gSender's 13 / 15.5 mm fallbacks; the tool length wizard
takes its safe height from a Safe Z setting (machine mm, default -10, checked
against the homing pull-off) instead of gSender's '-0.5' for `$13=1`, which runs
under G21 as -0.5 mm; removing the last tool falls back to Auto only on plates
that offer it; settings live in the browser's local storage; a Z max travel
setting stands in for an unreported `$132`.

## CNCjs (tests only)

`test/vendor/cncjs/` holds unmodified files from CNCjs 1.11.5, Copyright (c)
2015-2017 Cheton Wu, MIT License (see `test/vendor/cncjs/LICENSE`). They are
used by the tests and are not part of the npm package.
