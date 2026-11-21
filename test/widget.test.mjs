import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.gif': 'image/gif' };
let browser;

before(async () => {
    browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
});
after(() => browser?.close());

// Stands in for CNCjs's socket.io 2.x client: records what the widget emits and
// lets a test play CNCjs's events into it.
const FAKE_SOCKET_IO = `
window.__emitted = [];
window.io = { connect(url, opts) {
  const handlers = {};
  const socket = {
    opts,
    on(name, fn) { (handlers[name] ||= []).push(fn); },
    emit(name, ...args) {
      window.__emitted.push([name, ...args]);
      if (name === 'open' && typeof args[2] === 'function') setTimeout(() => args[2](null));
    },
    disconnect() {},
    fire(name, ...args) { (handlers[name] || []).forEach((fn) => fn(...args)); },
  };
  window.__socket = socket;
  setTimeout(() => socket.fire('connect'));
  return socket;
} };`;

const serveWidget = async (ctx, controllers) => {
    await ctx.route(/^http:\/\/(cncjs|widget)\.test\//, async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/probe/')) {
            const rel = url.pathname.slice('/probe/'.length) || 'index.html';
            const file = path.join(webDir, rel);
            if (!file.startsWith(webDir)) return route.fulfill({ status: 404, body: '' });
            const body = await readFile(file).catch(() => null);
            if (!body) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body });
        }
        if (url.pathname === '/socket.io/socket.io.js') return route.fulfill({ contentType: 'text/javascript', body: FAKE_SOCKET_IO });
        if (url.pathname === '/api/controllers') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(controllers()) });
        if (url.pathname === '/main.css') return route.fulfill({ contentType: 'text/css', body: 'body{min-width:960px}' });
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><head><link rel="stylesheet" href="/main.css"></head><body><iframe name="w"
          sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
          style="width:338px;height:1400px" src="${url.searchParams.get('widget') ?? 'http://cncjs.test'}/probe/?token=tok123"></iframe><script>
          addEventListener('message', e => {
            if (e.data?.token === 'tok123' && e.data.action?.type === 'connect')
              e.source.postMessage({ token: 'tok123', action: { type: 'change', payload: { port: 'COM7', controller: 'Grbl' } } }, '*');
          });</script>` });
    });
};

async function standalone() {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
    await serveWidget(ctx, () => []);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://widget.test/probe/');
    await page.locator('#gcode').filter({ hasText: 'G38.2' }).waitFor();
    return { ctx, page, errors };
}

const OPEN_PORT = () => [{ port: 'COM7', baudrate: 115200, rtscts: false, controller: { type: 'Grbl' }, workflow: { state: 'idle' } }];
const grblState = ({ activeState = 'Idle', pinState = '', units = 'G21' } = {}) => ({
    status: { activeState, mpos: { x: '-100.000', y: '-50.000', z: '-10.000' }, wpos: { x: '0.000', y: '0.000', z: '5.000' }, ...(pinState ? { pinState } : {}) },
    parserstate: { modal: { motion: 'G0', wcs: 'G54', plane: 'G17', units, distance: 'G90', feedrate: 'G94', program: 'M0', spindle: 'M5', coolant: 'M9' }, tool: '0', feedrate: '1000', spindle: '0' },
});

async function embedded({ settings = { settings: { $10: '1' } }, widget } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1500 } });
    await serveWidget(ctx, OPEN_PORT);
    const host = await ctx.newPage();
    const errors = [];
    host.on('pageerror', (e) => errors.push(e.message));
    await host.goto(`http://cncjs.test/${widget ? `?widget=${encodeURIComponent(widget)}` : ''}`);
    const w = host.frameLocator('iframe[name="w"]');
    const frame = () => host.frame({ name: 'w' });
    const fire = (name, ...args) => frame().evaluate(([n, a]) => window.__socket.fire(n, ...a), [name, args]);
    const emitted = () => frame().evaluate(() => window.__emitted);
    if (!widget) {
        await w.locator('#status').filter({ hasText: 'COM7' }).waitFor();
        await host.waitForFunction(() => window.frames[0]?.__emitted?.some((e) => e[0] === 'open'));
        await fire('serialport:open', { port: 'COM7', baudrate: 115200, controllerType: 'Grbl', inuse: true });
        await fire('controller:settings', 'Grbl', settings);
        await fire('controller:state', 'Grbl', grblState());
        await fire('workflow:state', 'idle');
    }
    return { ctx, host, w, fire, emitted, errors };
}

test('standalone, the page loads with a preview and Run disabled', async () => {
    const { ctx, page, errors } = await standalone();
    try {
        assert.deepEqual(errors, []);
        assert.match(await page.locator('#status').innerText(), /Preview only/);
        assert.equal(await page.getByRole('button', { name: 'Probe', exact: true }).isDisabled(), true);
        assert.equal(await page.getByTestId('touch-status').getAttribute('data-touch'), 'none');
        assert.equal(await page.getByLabel('Touch plate').inputValue(), 'Standard Block');
        assert.equal(await page.getByLabel('Connection test').isChecked(), true);
        const code = await page.locator('#gcode').innerText();
        assert.match(code, /^; Initial Probe setup/);
        assert.match(code, /\nG90$/);
    } finally {
        await ctx.close();
    }
});

test('switching plate types shows that plate\'s routines and settings', async () => {
    const { ctx, page, errors } = await standalone();
    try {
        await page.getByText('Settings', { exact: true }).click();
        const routines = () => page.locator('#commands button').allInnerTexts();
        const fields = () => page.locator('#fields label').allInnerTexts();
        const expected = {
            'Standard Block': { routines: ['Z', 'XYZ', 'XY', 'X', 'Y'], has: ['Block thickness (mm)', 'XY thickness (mm)', 'Final Z retract (mm)'], lacks: ['Puck thickness (mm)', 'Tip diameter (mm)'] },
            'Z Probe': { routines: ['Z'], has: ['Puck thickness (mm)', 'Z probe distance (mm)'], lacks: ['Block thickness (mm)', 'XY thickness (mm)'] },
            '3D Probe': { routines: ['Z', 'XYZ', 'XY', 'X', 'Y'], has: ['Tip diameter (mm)', 'Z offset (mm)', 'XY retract (mm)'], lacks: ['Block thickness (mm)'] },
            AutoZero: { routines: ['Z', 'XYZ', 'XY', 'X', 'Y'], has: ['AutoZero thickness (mm)', 'Final Z retract (mm)'], lacks: ['Fast find (mm/min)', 'Z probe distance (mm)'] },
            BitZero: { routines: ['Z', 'XYZ', 'XY', 'X', 'Y'], has: ['BitZero thickness (XYZ) (mm)', 'BitZero thickness (Z-only) (mm)'], lacks: ['Probe Movement Speed (mm/min)', 'Retraction (mm)'] },
        };
        for (const [plate, want] of Object.entries(expected)) {
            await page.getByLabel('Touch plate').selectOption(plate);
            assert.deepEqual(await routines(), want.routines, plate);
            const shown = await fields();
            for (const label of want.has) assert.ok(shown.includes(label), `${plate} should show ${label}: ${shown}`);
            for (const label of want.lacks) assert.ok(!shown.includes(label), `${plate} should not show ${label}`);
        }
        // the corner is not asked for the Z Probe puck
        await page.getByLabel('Touch plate').selectOption('Z Probe');
        assert.equal(await page.locator('#corner-row').isHidden(), true);
        // AutoZero offers Auto and Tip besides tool diameters on routines that use one
        await page.getByLabel('Touch plate').selectOption('AutoZero');
        await page.getByRole('button', { name: 'XYZ', exact: true }).click();
        const options = await page.getByLabel('Tool diameter', { exact: true }).locator('option').allInnerTexts();
        assert.deepEqual(options.slice(0, 2), ['Auto', 'Tip']);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('the preview follows routine, corner, diameter, settings and units', async () => {
    const { ctx, page, errors } = await standalone();
    try {
        const code = () => page.locator('#gcode').innerText();
        await page.getByRole('button', { name: 'XYZ', exact: true }).click();
        assert.match(await code(), /G10 L20 P0 X0Y0Z0/);
        assert.match(await code(), /%X_RETRACT_DIRECTION=-1/);
        await page.getByRole('button', { name: 'TR', exact: true }).click();
        assert.match(await code(), /%X_RETRACT_DIRECTION=1/);
        await page.getByLabel('Tool diameter', { exact: true }).selectOption('3.175');
        assert.match(await code(), /%X_THICKNESS=11.588/);
        await page.getByText('Settings', { exact: true }).click();
        await page.getByLabel('Block thickness').fill('20');
        assert.match(await code(), /%Z_THICKNESS=20/);
        await page.getByRole('button', { name: 'inch', exact: true }).click();
        assert.match(await code(), /^G21\n/);
        assert.match(await code(), /G91 G20/);
        assert.match(await code(), /%Z_THICKNESS=0.787/);
        assert.equal(await page.getByLabel('Block thickness').inputValue(), '0.787');
        // settings persist across a reload
        await page.reload();
        await page.locator('#gcode').filter({ hasText: 'G38.2' }).waitFor();
        assert.match(await code(), /%Z_THICKNESS=0.787/);
        assert.equal(await page.getByRole('button', { name: 'XYZ', exact: true }).getAttribute('aria-pressed'), 'true');
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('tool length mode previews gSender\'s wizard steps', async () => {
    const { ctx, page, errors } = await standalone();
    try {
        await page.getByRole('button', { name: 'Tool length', exact: true }).click();
        assert.match(await page.locator('#code-note').innerText(), /Z max travel/);
        await page.getByText('Settings', { exact: true }).click();
        await page.getByLabel('Z max travel ($132)').fill('120');
        await page.getByLabel('Sensor Z').fill('-30');
        const code = await page.locator('#gcode').innerText();
        assert.match(code, /%global\.toolchange\.PROBE_DISTANCE=88\.000/);
        assert.match(code, /%global\.toolchange\.TOOL_OFFSET=posz/);
        assert.match(code, /%toolchange_complete/);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded with FluidNC 4.x settings, tool length uses $132 and a visible Safe Z kept off the switch', async () => {
    // as reported by the user's FluidNC 4.1.1
    const { ctx, w, errors } = await embedded({ settings: { settings: { $10: '1', $13: '0', $22: '1', $130: '531', $131: '180', $132: '356' } } });
    try {
        await w.getByRole('button', { name: 'Tool length', exact: true }).click();
        await w.getByText('Settings', { exact: true }).click();
        assert.equal(await w.getByLabel('Z max travel ($132)').count(), 0);
        const safeZ = w.getByLabel('Safe Z');
        assert.equal(await safeZ.inputValue(), '-10');
        await w.getByLabel('Sensor Z').fill('-30');
        const code = () => w.locator('#gcode').innerText();
        assert.match(await code(), /%global\.toolchange\.PROBE_DISTANCE=324\.000/);
        assert.match(await code(), /%global\.toolchange\.Z_SAFE_HEIGHT=-10\n/);
        const start = w.getByRole('button', { name: 'Start', exact: true });
        assert.equal(await start.isDisabled(), false);
        // gSender's inch-mode value, run as mm, would sit inside the homing pull-off
        await safeZ.fill('-0.5');
        assert.match(await w.locator('#code-note').innerText(), /pull-off \(1 mm\)/);
        assert.equal(await start.isDisabled(), true);
        // at or below the sensor approach height the tool would cross into the sensor
        await safeZ.fill('-29');
        assert.match(await w.locator('#code-note').innerText(), /2 mm above the sensor Z \(-30\)/);
        assert.equal(await start.isDisabled(), true);
        await safeZ.fill('-20');
        assert.match(await code(), /%global\.toolchange\.Z_SAFE_HEIGHT=-20\n/);
        assert.equal(await start.isDisabled(), false);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded in CNCjs, a toolsetter touch passes the connection test and Start sends the preview', async () => {
    const { ctx, w, fire, emitted, errors } = await embedded();
    try {
        const sent = await emitted();
        const open = sent.find((e) => e[0] === 'open');
        assert.deepEqual(open.slice(1, 3), ['COM7', { controllerType: 'Grbl', baudrate: 115200, rtscts: false }]);
        assert.equal(sent.some((e) => e[0] === 'close'), false);
        await w.getByLabel('Touch plate').selectOption('Z Probe');
        const probe = w.getByRole('button', { name: 'Probe', exact: true });
        await assert.doesNotReject(probe.click());
        const start = w.getByRole('button', { name: 'Start probe' });
        assert.equal(await start.isDisabled(), true);
        await fire('controller:state', 'Grbl', grblState({ pinState: 'T' }));
        const touch = w.getByTestId('touch-status');
        assert.equal(await touch.getAttribute('data-touch'), 'toolsetter');
        assert.match(await touch.innerText(), /Toolsetter/);
        assert.equal(await start.isDisabled(), false);
        // the confirmation holds after the touch ends
        await fire('controller:state', 'Grbl', grblState());
        assert.equal(await touch.getAttribute('data-touch'), 'none');
        assert.equal(await start.isDisabled(), false);
        const preview = (await w.locator('#gcode').innerText()).split('\n');
        await start.click();
        const command = (await emitted()).find((e) => e[0] === 'command');
        assert.deepEqual(command.slice(1, 3), ['COM7', 'gcode']);
        assert.deepEqual(command[3], preview);
        assert.equal(await w.getByText('Initiated probing cycle').isVisible(), true);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded in CNCjs, the probe input shows as Probe and Run waits for an idle machine', async () => {
    const { ctx, w, fire, errors } = await embedded();
    try {
        await fire('controller:state', 'Grbl', grblState({ pinState: 'P' }));
        assert.equal(await w.getByTestId('touch-status').getAttribute('data-touch'), 'probe');
        assert.match(await w.getByTestId('touch-status').innerText(), /Probe/);
        await fire('controller:state', 'Grbl', grblState({ pinState: 'PT' }));
        assert.equal(await w.getByTestId('touch-status').getAttribute('data-touch'), 'both');
        const probe = w.getByRole('button', { name: 'Probe', exact: true });
        await fire('controller:state', 'Grbl', grblState({ activeState: 'Alarm' }));
        assert.equal(await probe.isDisabled(), true);
        await fire('controller:state', 'Grbl', grblState());
        await fire('workflow:state', 'running');
        assert.equal(await probe.isDisabled(), true);
        await fire('workflow:state', 'idle');
        assert.equal(await probe.isDisabled(), false);
        // with the connection test off Start is ready straight away
        await w.getByLabel('Connection test').uncheck();
        await probe.click();
        assert.equal(await w.getByRole('button', { name: 'Start probe' }).isDisabled(), false);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded in CNCjs, status reports leave the dropdowns alone', async () => {
    const { ctx, w, fire, errors } = await embedded();
    try {
        await w.getByRole('button', { name: 'XYZ', exact: true }).click();
        const marked = () => w.locator('#diameter option, #plate option').evaluateAll((els) => els.map((el) => el.dataset.mark));
        await w.locator('#diameter option, #plate option').evaluateAll((els) => els.forEach((el, i) => { el.dataset.mark = String(i); }));
        const before = await marked();
        for (const pinState of ['P', '', 'T']) await fire('controller:state', 'Grbl', grblState({ pinState }));
        assert.deepEqual(await marked(), before);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded in CNCjs, routines follow the machine\'s G20', async () => {
    const { ctx, w, fire, errors } = await embedded();
    try {
        await fire('controller:state', 'Grbl', grblState({ units: 'G20' }));
        const code = await w.locator('#gcode').innerText();
        assert.match(code, /^G21\n/);
        assert.match(code, /G91 G20/);
        assert.match(code, /\nG90\nG20$/);
        assert.equal(await w.locator('#units-row').isHidden(), true);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded in CNCjs, the tool length steps send gSender\'s wizard with its context', async () => {
    const { ctx, w, fire, emitted, errors } = await embedded({ settings: { settings: { $132: '120' } } });
    try {
        await w.getByRole('button', { name: 'Tool length', exact: true }).click();
        await w.getByLabel('Sensor X').fill('-12.5');
        await w.getByLabel('Sensor Y').fill('-400');
        await w.getByLabel('Sensor Z').fill('-30');
        assert.equal(await w.getByRole('button', { name: 'Probe tool length' }).isDisabled(), true);
        await w.getByRole('button', { name: 'Start', exact: true }).click();
        // the connection test waits for the toolsetter
        assert.equal(await w.getByRole('button', { name: 'Probe tool length' }).isDisabled(), true);
        await fire('controller:state', 'Grbl', grblState({ pinState: 'T' }));
        await w.getByRole('button', { name: 'Probe tool length' }).click();
        await w.getByRole('button', { name: 'Resume' }).click();
        const commands = (await emitted()).filter((e) => e[0] === 'command');
        assert.equal(commands.length, 3);
        assert.ok(commands[0][3].includes('%global.toolchange.PROBE_DISTANCE=88.000'));
        assert.ok(commands[0][3].includes('%global.toolchange.PROBE_POS_X=-12.5'));
        assert.ok(commands[1][3].includes('%global.toolchange.TOOL_OFFSET=posz'));
        assert.ok(commands[2][3].includes('%toolchange_complete'));
        for (const c of commands) assert.deepEqual(c[4], { programFeedrate: 'F1000', spindleRate: '0' });
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded in CNCjs, nothing can start while CNCjs is still feeding a routine', async () => {
    const { ctx, w, fire, errors } = await embedded({ settings: { settings: { $132: '120' } } });
    try {
        const probe = w.getByRole('button', { name: 'Probe', exact: true });
        assert.equal(await probe.isDisabled(), false);
        // between moves the machine reports Idle while the feeder still holds lines
        await fire('feeder:status', { hold: false, queue: 12, pending: true });
        assert.equal(await probe.isDisabled(), true);
        assert.equal(await w.getByRole('button', { name: 'Stop' }).isVisible(), true);
        await fire('feeder:status', { hold: false, queue: 0, pending: false });
        assert.equal(await probe.isDisabled(), false);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded in CNCjs, tool length Start runs once per wizard and Cancel starts over', async () => {
    const { ctx, w, emitted, errors } = await embedded({ settings: { settings: { $132: '120' } } });
    try {
        await w.getByRole('button', { name: 'Tool length', exact: true }).click();
        await w.getByLabel('Sensor Z').fill('-30');
        const start = w.getByRole('button', { name: 'Start', exact: true });
        const cancel = w.locator('#tl-cancel');
        assert.equal(await cancel.isDisabled(), true);
        await start.click();
        assert.equal(await start.isDisabled(), true);
        await cancel.click();
        assert.equal(await start.isDisabled(), false);
        assert.equal((await emitted()).filter((e) => e[0] === 'command').length, 1);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('embedded in CNCjs, status reports keep a selection in the G-code preview', async () => {
    const { ctx, w, fire, errors } = await embedded();
    try {
        const pre = w.locator('#gcode');
        await pre.evaluate((el) => window.getSelection().selectAllChildren(el));
        await fire('controller:state', 'Grbl', grblState({ pinState: 'P' }));
        assert.ok((await pre.evaluate(() => window.getSelection().toString())).includes('G38.2'));
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('removing the last tool on AutoZero falls back to Auto', async () => {
    const { ctx, page, errors } = await standalone();
    try {
        await page.getByLabel('Touch plate').selectOption('AutoZero');
        await page.getByRole('button', { name: 'XYZ', exact: true }).click();
        const diameter = page.getByLabel('Tool diameter', { exact: true });
        await diameter.selectOption('6.35');
        for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Remove' }).click();
        assert.deepEqual(await diameter.locator('option').allInnerTexts(), ['Auto', 'Tip']);
        assert.equal(await diameter.inputValue(), 'Auto');
        assert.match(await page.locator('#gcode').innerText(), /AZ Probe XYZ Auto/);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('with site storage blocked the widget still works for the page', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
    try {
        await serveWidget(ctx, () => []);
        await ctx.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }));
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('http://widget.test/probe/');
        await page.locator('#gcode').filter({ hasText: 'G38.2' }).waitFor();
        await page.getByRole('button', { name: 'XYZ', exact: true }).click();
        assert.match(await page.locator('#gcode').innerText(), /G10 L20 P0 X0Y0Z0/);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('an invalid entry\'s tooltip goes once the field shows a valid value again', async () => {
    const { ctx, page, errors } = await standalone();
    try {
        await page.getByText('Settings', { exact: true }).click();
        const field = page.getByLabel('Block thickness');
        const help = await field.getAttribute('title');
        await field.fill('-3');
        assert.equal(await field.getAttribute('aria-invalid'), 'true');
        await field.blur();
        assert.equal(await field.inputValue(), '15');
        assert.equal(await field.getAttribute('title'), help);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});

test('framed by CNCjs from another origin, the widget explains it cannot probe', async () => {
    const { ctx, w, errors } = await embedded({ widget: 'http://widget.test' });
    try {
        await w.locator('#status').filter({ hasText: 'served by CNCjs itself' }).waitFor();
        assert.equal(await w.getByRole('button', { name: 'Probe', exact: true }).isDisabled(), true);
        assert.deepEqual(errors, []);
    } finally {
        await ctx.close();
    }
});
