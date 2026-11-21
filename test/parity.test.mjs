// Golden parity: the ported modules emit exactly what gSender emits, line for
// line, for the same inputs. Upstream is the vendored source in test/upstream,
// pinned to gSender e73082afb83ee2377ed2077537c45fec33efaba0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadUpstream, resetGsender } from './helpers/upstream.mjs';
import * as probing from '../web/lib/probing.js';
import * as units from '../web/lib/units.js';
import * as softLimits from '../web/lib/soft-limits.js';
import createWizard, { calculateMaxZProbeDistance } from '../web/lib/probe-tool-length.js';
import { setControllerSettings, setMachinePosition } from '../web/lib/machine-store.js';
import { generateProbeCommands } from '../web/lib/probe-options.js';

const upstream = await loadUpstream();

const PLATES = ['Standard Block', 'AutoZero', 'Z Probe', '3D Probe', 'BitZero'];
const AXES = [
    { x: false, y: false, z: true },
    { x: true, y: true, z: true },
    { x: true, y: true, z: false },
    { x: true, y: false, z: false },
    { x: false, y: true, z: false },
    { x: true, y: false, z: true },
    { x: false, y: true, z: true },
];
const DIRECTIONS = [0, 1, 2, 3];
const UNITS = ['mm', 'in'];
// homing off; on with room below Z; on close to the bottom of Z travel (clamps the probe distance)
const MACHINES = [
    { homing: false, $132: undefined, mposZ: undefined },
    { homing: true, $132: '120', mposZ: '-10.000' },
    { homing: true, $132: '80', mposZ: '-62.500' },
];
const PROBE_TYPES = ['Auto', 'Tip', 'Diameter'];
const TOOL_DIAMETERS = { mm: [3.175, 6.35], in: [0.125, 0.25] };
const FIRMWARE = ['Grbl', 'grblHAL'];
const $13S = ['0', '1'];
const MOVE_SPEEDS = [0, 400];

const MM = {
    zThickness: { standardBlock: 15, autoZero: 5, zProbe: 15, probe3D: 0.4, bitZero: 13, bitZeroZOnly: 15.5 },
    xyThickness: 10,
    probeFeedrate: 75,
    probeFastFeedrate: 150,
    retractionDistance: 2,
    zRetractNormal: 2,
    zRetractAuto: 1,
    zProbeDistance: 30,
    tipDiameter3D: 2,
    xyRetract3D: 10,
};
const toInch = (v) => Number((v / 25.4).toFixed(3));

// The ProbingOptions gSender's Probe widget (index.tsx generateProbeCommands) builds.
const probingOptions = ({ plateType, axes, unit, machineCase, probeType, toolDiameter, firmware, $13, moveSpeed }) => {
    const metric = unit === 'mm';
    return {
        axes,
        modal: metric ? '21' : '20',
        probeFast: metric ? MM.probeFastFeedrate : toInch(MM.probeFastFeedrate),
        probeSlow: metric ? MM.probeFeedrate : toInch(MM.probeFeedrate),
        units: unit,
        retract: metric ? MM.retractionDistance : toInch(MM.retractionDistance),
        zRetractNormal: metric ? MM.zRetractNormal : toInch(MM.zRetractNormal),
        zRetractAuto: MM.zRetractAuto,
        toolDiameter: probeType === 'Diameter' ? toolDiameter : 0,
        zThickness: metric
            ? { ...MM.zThickness }
            : {
                autoZero: MM.zThickness.autoZero,
                standardBlock: toInch(MM.zThickness.standardBlock),
                zProbe: toInch(MM.zThickness.zProbe),
                probe3D: toInch(MM.zThickness.probe3D),
            },
        xyThickness: metric ? MM.xyThickness : toInch(MM.xyThickness),
        plateType,
        $13,
        probeDistances: metric ? { x: 30, y: 30, z: MM.zProbeDistance } : { x: 1.2, y: 1.2, z: toInch(MM.zProbeDistance) },
        probeType,
        homingEnabled: machineCase.homing,
        tipDiameter3D: metric ? MM.tipDiameter3D : toInch(MM.tipDiameter3D),
        xyRetract3D: metric ? MM.xyRetract3D : toInch(MM.xyRetract3D),
        probeMovementSpeed: metric ? moveSpeed : moveSpeed ? toInch(moveSpeed) : 0,
        probeMovementSpeedAuto: moveSpeed,
        firmware,
    };
};

const useMachine = (machineCase, $13) => {
    const settings = { settings: { $13, ...(machineCase.$132 === undefined ? {} : { $132: machineCase.$132 }) } };
    const mpos = machineCase.mposZ === undefined ? {} : { x: '-100.000', y: '-50.000', z: machineCase.mposZ };
    resetGsender({ redux: { controller: { settings, mpos } } });
    setControllerSettings(settings);
    setMachinePosition(mpos);
};

function* cases(plateType) {
    for (const axes of AXES)
        for (const direction of DIRECTIONS)
            for (const unit of UNITS)
                for (const machineCase of MACHINES)
                    for (const probeType of PROBE_TYPES)
                        for (const toolDiameter of TOOL_DIAMETERS[unit])
                            for (const firmware of FIRMWARE)
                                for (const $13 of $13S)
                                    for (const moveSpeed of MOVE_SPEEDS)
                                        yield { plateType, axes, direction, unit, machineCase, probeType, toolDiameter, firmware, $13, moveSpeed };
}

for (const plateType of PLATES) {
    test(`getProbeCode matches gSender for every ${plateType} case`, (t) => {
        let count = 0;
        let routines = 0;
        for (const c of cases(plateType)) {
            useMachine(c.machineCase, c.$13);
            const options = probingOptions(c);
            const expected = upstream.probing.getProbeCode(structuredClone(options), c.direction);
            const actual = probing.getProbeCode(structuredClone(options), c.direction);
            assert.deepStrictEqual(actual, expected, `differs for ${JSON.stringify(c)}`);
            count += 1;
            if (expected.length) routines += 1;
        }
        assert.ok(routines > 0);
        t.diagnostic(`${plateType}: ${count} cases, ${routines} non-empty routines, 0 diffs`);
    });
}

test('the exported probing helpers match gSender', () => {
    for (const d of [0, 1, 2, 3, 4]) {
        assert.deepStrictEqual(probing.getProbeDirections(d), upstream.probing.getProbeDirections(d));
        assert.deepStrictEqual(probing.getNextDirection(d), upstream.probing.getNextDirection(d));
    }
    assert.deepStrictEqual(probing.probeDirections, upstream.probing.probeDirections);
    for (const axis of ['x', 'y', 'z', 'X']) {
        for (const useFinalZ of [false, true]) {
            assert.deepStrictEqual(
                probing.getSingleAxisStandardRoutine(axis, useFinalZ),
                upstream.probing.getSingleAxisStandardRoutine(axis, useFinalZ),
            );
        }
    }
    const options = probingOptions({ plateType: 'Standard Block', axes: AXES[1], unit: 'mm', machineCase: MACHINES[0], probeType: 'Diameter', toolDiameter: 6.35, firmware: 'Grbl', $13: '0', moveSpeed: 0 });
    useMachine(MACHINES[0], '0');
    assert.deepStrictEqual(probing.getPreamble(structuredClone(options)), upstream.probing.getPreamble(structuredClone(options)));
});

test('unit conversions and soft limits match gSender', () => {
    for (const v of [0, 1, 2.5, 6.35, 15.5, 25.4, 30, 150, 0.125, 1.2, -3.3]) {
        assert.equal(units.mm2in(v), upstream.units.mm2in(v));
        assert.equal(units.in2mm(v), upstream.units.in2mm(v));
        assert.equal(units.convertToImperial(v), upstream.units.convertToImperial(v));
        assert.equal(units.convertToMetric(v), upstream.units.convertToMetric(v));
    }
    for (const machineCase of MACHINES) {
        useMachine(machineCase, '0');
        assert.deepStrictEqual(softLimits.getZTravels(), upstream.softLimits.getZTravels());
        for (const d of [5, 25, 30, 200]) {
            assert.equal(softLimits.getZDownTravel(d), upstream.softLimits.getZDownTravel(d));
            assert.equal(softLimits.getZUpTravel(d), upstream.softLimits.getZUpTravel(d));
        }
    }
});

// probeToolLength.tsx: the lines onStart sends and each step's lines.
const upstreamWizard = ({ settings, position, $13, $132 }) => {
    resetGsender({
        redux: { controller: { settings: { settings: { $13, ...($132 === undefined ? {} : { $132 }) } } } },
        store: { 'workspace.toolChangePosition': position },
        probeSettings: settings,
    });
    const wizard = upstream.createWizard();
    wizard.onStart();
    return { commands: globalThis.__gsender.commands, wizard };
};

test('the tool length wizard matches gSender', (t) => {
    let count = 0;
    const SETTINGS = [
        { slowSpeed: 75, fastSpeed: 150, retract: 2, zProbeDistance: 30, zProbeThickness: 15 },
        { slowSpeed: 40, fastSpeed: 300, retract: 3.5, zProbeDistance: 50, zProbeThickness: 5 },
    ];
    const POSITIONS = [
        { x: 0, y: 0, z: 0 },
        { x: -12.5, y: -400.25, z: -30 },
        { x: -790, y: -5, z: -110.125 },
    ];
    for (const settings of SETTINGS)
        for (const position of POSITIONS)
            for (const $13 of ['0', '1'])
                for (const $132 of [undefined, '150', '120.5']) {
                    const expected = upstreamWizard({ settings, position, $13, $132 });
                    const reduxSettings = { settings: { $13, ...($132 === undefined ? {} : { $132 }) } };
                    setControllerSettings(reduxSettings);
                    const commands = [];
                    // upstream's choice; the widget passes its own Safe Z setting instead
                    const zSafe = $13 === '1' ? '-0.5' : '-10';
                    const wizard = createWizard({ controller: { command: (...args) => commands.push(args) }, settings, position, zSafe });
                    wizard.onStart();
                    assert.deepStrictEqual(commands, expected.commands);
                    assert.deepStrictEqual(
                        JSON.parse(JSON.stringify({ intro: wizard.intro, steps: wizard.steps })),
                        JSON.parse(JSON.stringify({ intro: expected.wizard.intro, steps: expected.wizard.steps })),
                    );
                    assert.equal(calculateMaxZProbeDistance(settings.zProbeDistance, position), expected.commands[0][1][2].split('=')[1]);
                    count += 1;
                }
    t.diagnostic(`tool length: ${count} cases, 0 diffs`);
});

test('the Probe widget options builder hands getProbeCode what index.tsx hands it', () => {
    for (const c of [
        { plateType: 'Standard Block', axes: AXES[1], unit: 'mm', machineCase: MACHINES[0], probeType: 'Diameter', toolDiameter: 6.35, firmware: 'Grbl', $13: '0', moveSpeed: 0, direction: 2 },
        { plateType: 'Standard Block', axes: AXES[1], unit: 'in', machineCase: MACHINES[2], probeType: 'Diameter', toolDiameter: 0.25, firmware: 'Grbl', $13: '1', moveSpeed: 400, direction: 1 },
        { plateType: 'AutoZero', axes: AXES[1], unit: 'in', machineCase: MACHINES[1], probeType: 'Diameter', toolDiameter: 0.125, firmware: 'Grbl', $13: '0', moveSpeed: 400, direction: 3 },
        { plateType: '3D Probe', axes: AXES[2], unit: 'in', machineCase: MACHINES[0], probeType: 'Diameter', toolDiameter: 0.25, firmware: 'grblHAL', $13: '0', moveSpeed: 0, direction: 0 },
        { plateType: 'BitZero', axes: AXES[1], unit: 'in', machineCase: MACHINES[0], probeType: 'Auto', toolDiameter: 0, firmware: 'Grbl', $13: '1', moveSpeed: 0, direction: 2 },
    ]) {
        useMachine(c.machineCase, c.$13);
        const expected = [...upstream.probing.getProbeCode(probingOptions(c), c.direction), 'G90'];
        const actual = generateProbeCommands({
            probeCommand: { axes: c.axes },
            units: c.unit,
            touchplate: { touchplateType: c.plateType, xyThickness: MM.xyThickness, zThickness: { ...MM.zThickness } },
            probe: { ...MM, probeMovementSpeed: c.moveSpeed },
            toolDiameter: c.probeType === 'Diameter' ? c.toolDiameter : 0,
            probeType: c.probeType,
            direction: c.direction,
            $13: c.$13,
            $22: c.machineCase.homing ? '1' : '0',
            firmware: c.firmware,
            distance: 'G90',
        });
        assert.deepStrictEqual(actual, expected, JSON.stringify(c));
    }
});
