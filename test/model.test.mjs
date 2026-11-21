import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    STORAGE_KEY,
    defaultSettings,
    checkSafeZ,
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
    withoutTool,
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

test('on a G20 machine BitZero uses its thickness settings, in mm as its G21 routine needs', () => {
    setControllerSettings({ settings: {} });
    const base = withPlateType(defaultSettings(), 'BitZero');
    const settings = { ...base, command: 'XYZ Touch', probeProfile: { ...base.probeProfile, zThickness: { ...base.probeProfile.zThickness, bitZero: 12.7, bitZeroZOnly: 15 } } };
    const machine = { type: 'Grbl', modalUnits: 'G20', distance: 'G90', settings: { settings: {} } };
    assert.ok(zeroRoutine(settings, machine).lines.includes('%INSET_THICKNESS=12.7'));
    assert.ok(zeroRoutine({ ...settings, command: 'Z Touch' }, machine).lines.includes('%PROBE_THICKNESS=15'));
});

test('the tool length context gives CNCjs gSender\'s programFeedrate and spindleRate', () => {
    assert.deepEqual(toolchangeContext({ feedrate: 1200, spindle: 18000 }), { programFeedrate: 'F1200', spindleRate: '18000' });
});

test('removing the last tool falls back to Auto only where the plate offers it', () => {
    // two tools that both show as 0.125 in, as when 3.17 mm was added next to 3.175 mm
    const tools = [DEFAULT_TOOLS[1], newTool(3.17, 'mm')];
    const standard = withDiameterChoice({ ...defaultSettings(), tools, command: 'XYZ Touch' }, '0.125', DEFAULT_TOOLS[1]);
    const afterStandard = withoutTool(standard, '0.125', 'in');
    assert.deepEqual(afterStandard.tools, []);
    assert.equal(afterStandard.probeType, 'Diameter');
    assert.equal(toolDiameterOf(afterStandard, 'in'), 0.25);
    assert.equal(toolDiameterOf(afterStandard, 'mm'), 6.35);
    const autoZero = withPlateType(standard, 'AutoZero');
    const afterAutoZero = withoutTool(autoZero, '0.125', 'in');
    assert.equal(afterAutoZero.probeType, 'Auto');
    assert.equal(toolDiameterOf(afterAutoZero, 'in'), 0);
    // with tools left, the first remaining one is selected
    assert.equal(toolDiameterOf(withoutTool(defaultSettings(), '6.35', 'mm'), 'mm'), 3.175);
});

test('tool length travels at the Safe Z setting, kept out of the homing pull-off', () => {
    const settings = { ...defaultSettings(), toolChangePosition: { x: -10, y: -20, z: -30 } };
    setMachinePosition({ x: '-1.000', y: '-1.000', z: '-1.000' });
    // gSender would send -0.5 here: an inch value run as mm
    setControllerSettings({ settings: { $13: '1', $22: '1', $132: '356' } });
    assert.ok(toolLengthRoutine(settings).start.includes('%global.toolchange.Z_SAFE_HEIGHT=-10'));
    setControllerSettings({ settings: { $13: '0', $22: '1', $132: '356' } });
    assert.ok(toolLengthRoutine({ ...settings, safeZ: -25 }).start.includes('%global.toolchange.Z_SAFE_HEIGHT=-25'));
    // Grbl's default 1 mm pull-off without $27, the reported one with it
    assert.match(toolLengthRoutine({ ...settings, safeZ: -0.5 }).reason, /pull-off \(1 mm\)/);
    setControllerSettings({ settings: { $22: '1', $132: '356', $27: '3' } });
    assert.match(toolLengthRoutine({ ...settings, safeZ: -2 }).reason, /pull-off \(3 mm\)/);
    assert.deepEqual([toolLengthRoutine({ ...settings, safeZ: -3 }).reason, toolLengthRoutine({ ...settings, safeZ: -3 }).note], [undefined, undefined]);
});

test('Safe Z stays above the sensor and inside Z travel', () => {
    const homed = { $22: '1', $132: '100' };
    // at or below the sensor approach height, with 2 mm of clearance
    assert.match(checkSafeZ(-60, -30, homed, 'grbl').reason, /Safe Z must be at least 2 mm above the sensor Z \(-30\)/);
    assert.match(checkSafeZ(-29, -30, homed, 'grbl').reason, /above the sensor/);
    assert.deepEqual(checkSafeZ(-28, -30, homed, 'grbl'), {});
    // past the bottom of travel (soft limit ALARM:2)
    assert.match(checkSafeZ(-101, -150, homed, 'grbl').reason, /within Z travel \(\$132\): at or above -100/);
    assert.deepEqual(checkSafeZ(-100, -150, homed, 'grbl'), {});
    // Z homing down ($23 bit 2): the switch is at -$132, Z0 the top of travel
    const down = { ...homed, $23: '4', $27: '2' };
    assert.deepEqual(checkSafeZ(-0.5, -50, down, 'grbl'), {});
    assert.match(checkSafeZ(1, -50, down, 'grbl').reason, /at or below machine Z0/);
    assert.match(checkSafeZ(-99, -150, down, 'grbl').reason, /pull-off \(2 mm\) above the bottom of Z travel \(-100\)/);
    assert.deepEqual(checkSafeZ(-98, -150, down, 'grbl'), {});
    assert.match(checkSafeZ(Number.NaN, -30, homed, 'grbl').reason, /Set Safe Z/);
});

test('grblHAL\'s $22 bitmask counts as homing on when bit 0 is set', () => {
    for (const $22 of ['1', '3', '5', '7']) {
        assert.match(checkSafeZ(-0.5, -30, { $22, $27: '1' }, 'grbl').reason, /pull-off \(1 mm\)/, `$22=${$22}`);
        assert.match(checkSafeZ(5, -30, { $22, $27: '1' }, 'grbl').reason, /pull-off/, `$22=${$22}`);
    }
    for (const $22 of ['0', '2', '4']) assert.match(checkSafeZ(-0.5, -30, { $22 }, 'grbl').note, /Homing is off/, `$22=${$22}`);
});

test('on a homed Grbl range the sensor Z is blamed when no Safe Z can fit', () => {
    const homed = { $22: '1', $132: '100' };
    // the default sensor at Z0, a sign slip (+30), and one inside the pull-off
    for (const sensorZ of [0, 30, -2]) {
        const result = checkSafeZ(-10, sensorZ, homed, 'grbl');
        assert.match(result.reason, new RegExp(`^Sensor Z \\(${sensorZ}\\) leaves no room for Safe Z`));
        assert.match(result.reason, /Use current position/);
        // only a positive sensor Z points at the Machine Z range way out
        assert.equal(/set Machine Z range to Other/.test(result.reason), sensorZ > 0, `sensor Z ${sensorZ}`);
        // whatever Safe Z the operator tries, Sensor Z stays the problem
        assert.match(checkSafeZ(sensorZ + 5, sensorZ, homed, 'grbl').reason, /^Sensor Z/);
    }
    assert.deepEqual(checkSafeZ(-1, -3, homed, 'grbl'), {});
});

test('a missing or unknown Machine Z range keeps the Grbl checks', () => {
    for (const zRange of [undefined, null, '', 'Grbl', 'bogus']) {
        assert.match(checkSafeZ(-0.5, -30, { $22: '1' }, zRange).reason, /pull-off \(1 mm\)/, `zRange=${zRange}`);
    }
});

test('without the homed checks, the clearance reason also points at an unset Sensor Z', () => {
    // the default sensor at Z0 with homing off: raising Safe Z is not the fix
    for (const [reported, zRange] of [[{ $22: '0' }, 'grbl'], [{}, 'grbl'], [{ $22: '1' }, 'other']]) {
        const { reason } = checkSafeZ(-10, 0, reported, zRange);
        assert.match(reason, /2 mm above the sensor Z \(0\)/);
        assert.match(reason, /If Sensor Z is not where the sensor is: Jog the tool tip just above the sensor and use "Use current position"/);
    }
});

test('the default sensor location counts as unset on every path, so Safe Z is never checked against it', () => {
    const settings = defaultSettings();
    assert.deepEqual(settings.toolChangePosition, { x: 0, y: 0, z: 0 });
    for (const [reported, zRange] of [[{ $22: '0', $132: '356' }, 'grbl'], [{ $132: '356' }, 'grbl'], [{ $22: '1', $132: '356' }, 'other'], [{ $22: '1', $132: '356' }, 'grbl']]) {
        setControllerSettings({ settings: reported });
        for (const safeZ of [-10, 2, 50]) {
            const routine = toolLengthRoutine({ ...settings, zRange, safeZ });
            assert.equal(routine.reason, 'Set the sensor location first. Jog the tool tip just above the sensor and use "Use current position".', `${JSON.stringify(reported)} ${zRange} ${safeZ}`);
            assert.equal(routine.start, undefined);
        }
    }
    // any captured axis makes it a real location
    setControllerSettings({ settings: { $22: '0', $132: '356' } });
    assert.ok(toolLengthRoutine({ ...settings, toolChangePosition: { x: 0, y: 0, z: -30 } }).start);
});

test('Safe Z checks only the sensor without homing or when the operator picks another Z range', () => {
    // homing off or unreported: Z0 is wherever Z was at power-on
    for (const reported of [{ $22: '0', $132: '100' }, { $132: '100' }]) {
        const result = checkSafeZ(-0.5, -30, reported, 'grbl');
        assert.equal(result.reason, undefined);
        assert.match(result.note, /Homing is off or not reported/);
        assert.match(checkSafeZ(-40, -30, reported, 'grbl').reason, /above the sensor/);
    }
    // FluidNC with mpos_mm above zero: travel 0..+100, so +90 is a valid height
    const result = checkSafeZ(90, 20, { $22: '1', $132: '100' }, 'other');
    assert.equal(result.reason, undefined);
    assert.match(result.note, /set to Other/);
    assert.match(checkSafeZ(21, 20, { $22: '1', $132: '100' }, 'other').reason, /above the sensor/);
    // the verdict follows settings only, not where the head is
    const settings = { ...defaultSettings(), safeZ: 90, zRange: 'other', toolChangePosition: { x: 10, y: 10, z: 20 } };
    setControllerSettings({ settings: { $22: '1', $132: '356' } });
    const verdicts = ['95.000', '-50.000'].map((z) => {
        setMachinePosition({ x: '5.000', y: '5.000', z });
        const routine = toolLengthRoutine(settings);
        return [routine.reason, routine.note];
    });
    assert.deepEqual(verdicts[0], verdicts[1]);
    assert.match(verdicts[0][1], /set to Other/);
    assert.match(toolLengthRoutine({ ...settings, zRange: 'grbl' }).reason, /^Sensor Z \(20\)/);
});

test('FluidNC 4.x settings from CNCjs drive homing, soft limits and tool length', () => {
    // as reported by the user's FluidNC 4.1.1: $13=0 $22=1 $130=531 $131=180 $132=356
    const reported = { $13: '0', $22: '1', $130: '531', $131: '180', $132: '356' };
    const settings = { ...defaultSettings(), zMaxTravel: 100, toolChangePosition: { x: -5, y: -5, z: -50 } };
    setControllerSettings(effectiveControllerSettings(settings, { settings: reported }));
    setMachinePosition({ x: '-10.000', y: '-10.000', z: '-340.000' });
    const machine = { type: 'Grbl', modalUnits: 'G21', distance: 'G90', settings: { settings: reported } };
    // homing on: Z probe distance limited to 356 - 340 - 1
    assert.ok(zeroRoutine(settings, machine).lines.includes('%Z_PROBE_DISTANCE=-15'));
    // the reported $132 wins over the stand-in setting
    assert.ok(toolLengthRoutine(settings).start.includes('%global.toolchange.PROBE_DISTANCE=304.000'));
});
