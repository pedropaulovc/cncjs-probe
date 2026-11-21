# CNCjs 1.11.5 macro evaluation (test fixture)

Unmodified copies of the files CNCjs 1.11.5's Grbl controller uses to evaluate
`%` assignments and `[expression]` substitutions in G-code it feeds, from the
`cncjs@1.11.5` npm package (`dist/cncjs/server/...`). `test/cncjs-eval.test.mjs`
runs the widget's routines through them the way `GrblController`'s feeder
`dataFilter` does.

- `server/lib/evaluate-expression.js`
- `server/lib/evaluate-assignment-expression.js`
- `server/lib/translate-expression.js`
- `server/controllers/constants.js`
- `server/controllers/utils/builtin-command.js`

`server/lib/logger.js` is a stand-in for CNCjs's winston logger that records
errors. CNCjs is MIT licensed, Copyright (c) 2015-2017 Cheton Wu; see `LICENSE`
in this directory. They are not part of the npm package.
