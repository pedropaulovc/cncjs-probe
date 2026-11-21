# Upstream gSender sources (test fixtures)

These files are unmodified copies from gSender, used only by
`test/parity.test.mjs` to check that the ported modules under `web/lib/` emit the
same G-code as upstream for the same inputs. They are not part of the npm
package.

- Source: https://github.com/Sienci-Labs/gsender
- Commit: `e73082afb83ee2377ed2077537c45fec33efaba0`
- License: GNU General Public License v3.0, Copyright (C) Sienci Labs Inc.
  Files that carry upstream's license header keep it; `lib/Probing.ts` and
  `lib/SoftLimits.js` have none upstream and are covered by gSender's
  repository-wide GPL-3.0 license (see `LICENSE` at the repository root).

| File | Upstream path |
| --- | --- |
| `src/app/src/lib/Probing.ts` | same |
| `src/app/src/lib/constants.ts` | same |
| `src/app/src/lib/SoftLimits.js` | same |
| `src/app/src/lib/units.ts` | same |
| `src/app/src/constants/index.ts` | same |
| `src/app/src/wizards/probeToolLength.tsx` | same |

The test bundles them with esbuild and replaces only the gSender app modules
they import that need a running app (`app/store`, `app/store/redux`,
`app/lib/controller`, `app/lib/toolChangeUtils`, type-only definitions) with
stubs from `test/stubs/`.
