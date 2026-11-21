import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    STORAGE_KEY,
    defaultSettings,
    effectiveControllerSettings,
    loadSettings,
    saveSettings,
    selectedCommand,
    toolDiameterOf,
    toolLengthRoutine,
    toolchangeContext,
    unitsOf,
    withDiameterChoice,
    withPlateType,
    zeroRoutine,
} from '../web/lib/model.js';
import { gcodeSafe, newTool, toolDiameterOptions, DEFAULT_TOOLS } from '../web/lib/probe-options.js';
import { setControllerSettings, setMachinePosition } from '../web/lib/machine-store.js';

const memoryStorage = () => {
    const items = new Map();
    return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)) };
};

test('gcodeSafe runs in G21 and puts a G20 machine back in G20, like gSender\'s gcode:safe', () => {
    assert.deepEqual(gcodeSafe(['A', 'B'], 'G21', 'G21'), ['A', 'B']);
    assert.deepEqual(gcodeSafe(['A', 'B'], 'G21', 'G20'), ['G21', 'A', 'B', 'G20']);
    assert.equal(gcodeSafe(['A'], 'G21', undefined), null);
});

test('settings survive a reload and new settings take their defaults', () => {
    const storage = memoryStorage();
    const changed = { ...withPlateType(defaultSettings(), '3D Probe'), probe: { ...defaultSettings().probe, tipDiameter3D: 1.5 } };
    saveSettings(storage, changed);
    assert.deepEqual(loadSettings(storage), changed);
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    delete saved.probe.xyRetract3D;
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    assert.equal(loadSettings(storage).probe.xyRetract3D, 10);
    storage.setItem(STORAGE_KEY, '{not json');
    assert.deepEqual(loadSettings(storage), defaultSettings());
});

test('the Z Probe plate only probes Z', () => {
    const settings = withPlateType({ ...defaultSettings(), command: 'XY Touch' }, 'Z Probe');
    assert.equal(selectedCommand(settings).id, 'Z Touch');
});

test('leaving AutoZero with Auto selected goes back to gSender\'s default tool', () => {
    let settings = withPlateType(defaultSettings(), 'AutoZero');
    settings = withDiameterChoice(settings, 'Auto', null);
    assert.equal(toolDiameterOf(settings, 'mm'), 0);
    settings = withPlateType(settings, 'Standard Block');
    assert.equal(settings.probeType, 'Diameter');
    assert.equal(toolDiameterOf(settings, 'mm'), 6.35);
    assert.equal(toolDiameterOf(settings, 'in'), 0.25);
});

test('the diameter list offers Auto and Tip for AutoZero and BitZero, then tools in ascending order', () => {
    const tools = [...DEFAULT_TOOLS, newTool(2, 'mm')];
    assert.deepEqual(toolDiameterOptions(tools, 'mm', 'AutoZero').map((o) => o.value), ['Auto', 'Tip', '2', '3.175', '6.35', '9.525', '12.7', '15.875']);
    assert.deepEqual(toolDiameterOptions(tools, 'in', 'Standard Block').map((o) => o.value), ['0.079', '0.125', '0.25', '0.375', '0.5', '0.625']);
});

test('routines run in the machine\'s units', () => {
    setControllerSettings({ settings: {} });
    const settings = defaultSettings();
    assert.equal(unitsOf(settings, { modalUnits: 'G20' }), 'in');
    assert.equal(unitsOf(settings, { modalUnits: 'G21' }), 'mm');
    assert.equal(unitsOf({ ...settings, previewUnits: 'in' }, {}), 'in');
    const inch = zeroRoutine(settings, { type: 'Grbl', modalUnits: 'G20', distance: 'G90', settings: { settings: {} } }).lines;
    assert.equal(inch[0], 'G21');
    assert.ok(inch.includes('G91 G20'));
    assert.ok(inch.includes('%Z_PROBE_DISTANCE=-1.181'));
    assert.deepEqual(inch.slice(-2), ['G90', 'G20']);
    assert.match(zeroRoutine(settings, { type: 'Grbl', distance: 'G90', settings: { settings: {} } }).reason, /units/);
});

test('homing clamps the Z probe distance to the travel left, from CNCjs\'s $22 and $132', () => {
    setControllerSettings({ settings: { $22: '1', $132: '80' } });
    setMachinePosition({ x: '0', y: '0', z: '-62.500' });
    const machine = { type: 'Grbl', modalUnits: 'G21', distance: 'G90', settings: { settings: { $22: '1', $132: '80' } } };
    assert.ok(zeroRoutine(defaultSettings(), machine).lines.includes('%Z_PROBE_DISTANCE=-16.5'));
});

test('tool length needs Z max travel; the widget setting stands in when $132 is not reported', () => {
    const settings = { ...defaultSettings(), toolChangePosition: { x: -10, y: -20, z: -30 } };
    setControllerSettings(effectiveControllerSettings(settings, { settings: { $10: '1' } }));
    assert.match(toolLengthRoutine(settings).reason, /Z max travel/);
    const withTravel = { ...settings, zMaxTravel: 100 };
    setControllerSettings(effectiveControllerSettings(withTravel, { settings: { $10: '1' } }));
    assert.ok(toolLengthRoutine(withTravel).start.includes('%global.toolchange.PROBE_DISTANCE=68.000'));
    // a reported $132 wins over the stand-in
    setControllerSettings(effectiveControllerSettings(withTravel, { settings: { $132: '150' } }));
    assert.ok(toolLengthRoutine(withTravel).start.includes('%global.toolchange.PROBE_DISTANCE=118.000'));
});

test('the tool length context gives CNCjs gSender\'s programFeedrate and spindleRate', () => {
    assert.deepEqual(toolchangeContext({ feedrate: 1200, spindle: 18000 }), { programFeedrate: 'F1200', spindleRate: '18000' });
});
