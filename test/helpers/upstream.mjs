// Loads the vendored gSender sources (test/upstream) as one ES module: esbuild
// transpiles the TypeScript, drops type-only imports, and points the gSender
// app modules that need a running app at test/stubs. State the stubs read
// lives on globalThis.__gsender.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../upstream/src/app/src/', import.meta.url));
const stubs = fileURLToPath(new URL('../stubs/', import.meta.url));

const STUBS = {
    'app/store/redux': 'redux.js',
    'app/store': 'store.js',
    'app/lib/controller': 'controller.js',
    'app/lib/toolChangeUtils': 'toolChangeUtils.js',
};

const gsenderAliases = {
    name: 'gsender-aliases',
    setup(b) {
        b.onResolve({ filter: /^app\// }, (args) => {
            if (STUBS[args.path]) return { path: path.join(stubs, STUBS[args.path]) };
            return { path: path.join(root, args.path.slice('app/'.length)) };
        });
        // lib/units.ts imports the settings store relatively
        b.onResolve({ filter: /^\.\.\/store$/ }, () => ({ path: path.join(stubs, 'store.js') }));
    },
};

let loaded = null;

export const resetGsender = (state = {}) => {
    globalThis.__gsender = { redux: {}, store: {}, commands: [], probeSettings: null, ...state };
};

export function loadUpstream() {
    if (loaded) return loaded;
    resetGsender();
    loaded = build({
        stdin: {
            contents: [
                "export * as probing from './lib/Probing.ts';",
                "export * as units from './lib/units.ts';",
                "export * as softLimits from './lib/SoftLimits.js';",
                "export { default as createWizard } from './wizards/probeToolLength.tsx';",
            ].join('\n'),
            resolveDir: root,
            loader: 'ts',
            sourcefile: 'upstream-entry.ts',
        },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'node',
        logLevel: 'silent',
        plugins: [gsenderAliases],
    }).then(({ outputFiles }) => {
        const source = outputFiles[0].text;
        return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    });
    return loaded;
}
