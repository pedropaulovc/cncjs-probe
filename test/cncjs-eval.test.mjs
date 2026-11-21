// Every routine the widget sends, fed through CNCjs 1.11.5's own macro
// evaluation the way GrblController's feeder does it, comes out as plain G-code:
// no `%` assignment or `[expression]` left over, nothing undefined or NaN, and
// every word a letter with a finite number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
    availableCommands,
    defaultSettings,
    toolLengthRoutine,
    toolchangeContext,
    withDiameterChoice,
    withPlateType,
    zeroRoutine,
} from '../web/lib/model.js';
import { setControllerSettings, setMachinePosition } from '../web/lib/machine-store.js';
import { DEFAULT_TOOLS } from '../web/lib/probe-options.js';

const require = createRequire(import.meta.url);
const vendor = './vendor/cncjs/server/';
const translateExpression = require(`${vendor}lib/translate-expression.js`).default;
const evaluateAssignmentExpression = require(`${vendor}lib/evaluate-assignment-expression.js`).default;
const builtinCommand = require(`${vendor}controllers/utils/builtin-command.js`);
const { GLOBAL_OBJECTS, BUILTIN_COMMAND_MSG, BUILTIN_COMMAND_WAIT } = require(`${vendor}controllers/constants.js`);
const { errors: evaluationErrors } = require(`${vendor}lib/logger.js`);
const gcodeParser = require('gcode-parser');

// GrblController: one controller keeps `sharedContext` (the macro `global`) while the port is open.
const fakeController = () => ({
    sharedContext: {},
    mpos: { x: -101.25, y: -52.5, z: -12.75 },
    wpos: { x: 3.125, y: -4.5, z: 6.25 },
    modal: { motion: 'G0', wcs: 'G54', plane: 'G17', units: 'G21', distance: 'G90', feedrate: 'G94', program: 'M0', spindle: 'M5', coolant: 'M9' },
});

// GrblController.populateContext
const populateContext = (controller, context) => Object.assign(context || {}, {
    global: controller.sharedContext,
    xmin: Number(context.xmin) || 0,
    xmax: Number(context.xmax) || 0,
    ymin: Number(context.ymin) || 0,
    ymax: Number(context.ymax) || 0,
    zmin: Number(context.zmin) || 0,
    zmax: Number(context.zmax) || 0,
    mposx: controller.mpos.x, mposy: controller.mpos.y, mposz: controller.mpos.z, mposa: 0, mposb: 0, mposc: 0,
    posx: controller.wpos.x, posy: controller.wpos.y, posz: controller.wpos.z, posa: 0, posb: 0, posc: 0,
    modal: { ...controller.modal, coolant: [controller.modal.coolant].join('\n') },
    tool: 0,
    params: {},
}, GLOBAL_OBJECTS);

// GrblController 'gcode' command + feeder dataFilter: the lines that reach the serial port.
const feed = (controller, commands, context = {}) => {
    const data = [commands].flat().join('\n').split(/\r?\n/).filter((line) => typeof line === 'string' && line.trim().length > 0);
    const sent = [];
    for (const originalLine of data) {
        let line = originalLine.trim();
        context = populateContext(controller, context);
        if (line[0] === '%') {
            const [command, commandArgs] = builtinCommand.match(line) ?? [];
            if (command === BUILTIN_COMMAND_MSG) continue;
            if (command === BUILTIN_COMMAND_WAIT) {
                sent.push(`G4 P${(parseFloat(commandArgs) || 0.5).toFixed(3) * 1}`);
                continue;
            }
            const parts = line.split(/;([^]*)/);
            evaluateAssignmentExpression(String(parts[0]).trim().slice(1), context);
            continue;
        }
        line = translateExpression(line, context);
        const { line: stripped, words } = gcodeParser.parseLine(line, { flatten: true, lineMode: 'stripped' });
        if (stripped) sent.push({ line: stripped, words, from: originalLine });
    }
    return sent.map((s) => (typeof s === 'string' ? { line: s, words: s.split(' '), from: '%wait' } : s));
};

const WORD = /^[GMXYZFPLST]-?\d+(\.\d+)?$/;
const assertPlainGcode = (sent, label) => {
    assert.deepEqual(evaluationErrors, [], `${label}: CNCjs failed to evaluate an expression`);
    assert.ok(sent.length > 0, `${label}: nothing sent`);
    for (const { line, words, from } of sent) {
        assert.doesNotMatch(line, /[[\]%]|undefined|NaN|Infinity/, `${label}: "${from}" became "${line}"`);
        assert.equal(words.join(' ').replace(/\s+/g, ''), line.replace(/\s+/g, ''), `${label}: "${line}" has text that is not a G-code word`);
        for (const word of words) assert.match(word, WORD, `${label}: "${word}" in "${line}" (from "${from}")`);
    }
};

const machineFor = (units) => ({ type: 'Grbl', modalUnits: units, distance: 'G90', settings: { settings: {} } });

test('every zero routine evaluates to plain G-code in CNCjs', (t) => {
    let routines = 0;
    for (const plate of ['Standard Block', 'AutoZero', 'Z Probe', '3D Probe', 'BitZero']) {
        for (const modalUnits of ['G21', 'G20']) {
            for (const [homing, $13] of [[false, '0'], [true, '0'], [false, '1']]) {
                const reported = { $13, ...(homing ? { $22: '1', $132: '80' } : {}) };
                setControllerSettings({ settings: reported });
                setMachinePosition({ x: '-101.250', y: '-52.500', z: '-12.750' });
                let settings = withPlateType(defaultSettings(), plate);
                for (const command of availableCommands(settings)) {
                    for (const direction of [0, 1, 2, 3]) {
                        const choices = plate === 'AutoZero' || plate === 'BitZero' ? ['Auto', 'Tip', 'tool'] : ['tool'];
                        for (const choice of choices) {
                            settings = choice === 'tool'
                                ? withDiameterChoice(settings, '3.175', DEFAULT_TOOLS[1])
                                : withDiameterChoice(settings, choice, null);
                            settings = { ...settings, command: command.id, probe: { ...settings.probe, direction, probeMovementSpeed: direction % 2 ? 300 : 0 } };
                            const machine = { ...machineFor(modalUnits), settings: { settings: reported } };
                            const { lines, reason } = zeroRoutine(settings, machine);
                            assert.equal(reason, undefined);
                            const controller = fakeController();
                            controller.modal.units = modalUnits;
                            const label = `${plate} ${command.id} corner ${direction} ${modalUnits} ${choice}${homing ? ' homing' : ''} $13=${$13}`;
                            assertPlainGcode(feed(controller, lines), label);
                            routines += 1;
                        }
                    }
                }
            }
        }
    }
    t.diagnostic(`${routines} zero routines evaluated`);
});

// With $13=1 CNCjs's posx/posy/posz are inches; gSender's server would have given mm.
const inchReports = () => {
    const controller = fakeController();
    controller.wpos = { x: 2, y: -0.5, z: 1 };
    return controller;
};
const words = (sent, letter) => sent.flatMap((s) => s.words.filter((w) => w[0] === letter).map((w) => Number(w.slice(1))));

test('reporting inches ($13=1), BitZero centres on the bore in mm', () => {
    setControllerSettings({ settings: { $13: '1' } });
    const settings = { ...withPlateType(defaultSettings(), 'BitZero'), command: 'XYZ Touch' };
    const { lines } = zeroRoutine(settings, { ...machineFor('G21'), settings: { settings: { $13: '1' } } });
    const sent = feed(inchReports(), lines);
    assertPlainGcode(sent, 'BitZero $13=1');
    const centring = sent.filter((s) => /^G1 ?[XY]-?[\d.]+ ?F300$/.test(s.line) && /\(X1 \+ X2\)|\(Y1 \+ Y2\)/.test(s.from));
    assert.deepEqual(centring.map((s) => s.line.replace(/\s/g, '')), ['G1X50.8F300', 'G1Y-12.7F300']);
});

test('reporting inches ($13=1), AutoZero keeps CNCjs\'s inch positions for its G20 moves', () => {
    setControllerSettings({ settings: { $13: '1' } });
    const settings = withDiameterChoice({ ...withPlateType(defaultSettings(), 'AutoZero'), command: 'XYZ Touch' }, 'Auto', null);
    const { lines } = zeroRoutine(settings, { ...machineFor('G21'), settings: { settings: { $13: '1' } } });
    assert.ok(lines.includes('%X_LEFT=posx'));
    assert.ok(lines.includes('G20 G91 G0 X[X_CENTER]'));
});

test('reporting inches ($13=1), the tool length wizard saves mm for its G21 moves', () => {
    setControllerSettings({ settings: { $13: '1', $132: '120' } });
    const routine = toolLengthRoutine({ ...defaultSettings(), toolChangePosition: { x: -12.5, y: -400.25, z: -30 } });
    const controller = inchReports();
    const context = toolchangeContext({ feedrate: 40, spindle: 0 });
    feed(controller, routine.start, { ...context });
    assert.deepEqual(
        [controller.sharedContext.toolchange.XPOS, controller.sharedContext.toolchange.YPOS, controller.sharedContext.toolchange.ZPOS],
        [50.8, -12.7, 25.4],
    );
    feed(controller, routine.probe, { ...context });
    assert.equal(controller.sharedContext.toolchange.TOOL_OFFSET, 25.4);
    const resume = feed(controller, routine.resume, { ...context });
    assertPlainGcode(resume, 'resume $13=1');
    assert.deepEqual(words(resume.filter((s) => s.line.startsWith('G90')), 'X'), [50.8]);
    assert.deepEqual(words(resume.filter((s) => s.line.startsWith('G90')), 'Z'), [25.4]);
});

test('the tool length steps evaluate to plain G-code in CNCjs, sharing global.toolchange', () => {
    setControllerSettings({ settings: { $132: '120' } });
    const settings = { ...defaultSettings(), toolChangePosition: { x: -12.5, y: -400.25, z: -30 } };
    const routine = toolLengthRoutine(settings);
    assert.equal(routine.reason, undefined);
    const controller = fakeController();
    controller.modal.spindle = 'M3';
    const context = toolchangeContext({ feedrate: 1200, spindle: 18000 });
    assertPlainGcode(feed(controller, routine.start, { ...context }), 'start');
    assert.equal(controller.sharedContext.toolchange.PROBE_DISTANCE, 88);
    const probe = feed(controller, routine.probe, { ...context });
    assertPlainGcode(probe, 'probe');
    assert.ok(probe.some((s) => s.line === 'G53G0X-12.5Y-400.25' || s.line === 'G53 G0 X-12.5 Y-400.25'), JSON.stringify(probe.map((s) => s.line)));
    assert.ok(probe.some((s) => /^G38\.2 ?Z-88 ?F150$/.test(s.line)));
    assert.equal(controller.sharedContext.toolchange.TOOL_OFFSET, controller.wpos.z);
    const resume = feed(controller, routine.resume, { ...context });
    assertPlainGcode(resume, 'resume');
    assert.ok(resume.some((s) => /^M3 ?S18000$/.test(s.line)));
    assert.ok(resume.some((s) => /^G21 ?G90 ?F1200$/.test(s.line)));
});

test('without the widget\'s context CNCjs would leave Resume\'s feed rate unresolved', () => {
    setControllerSettings({ settings: { $132: '120' } });
    const routine = toolLengthRoutine({ ...defaultSettings(), toolChangePosition: { x: 0, y: 0, z: -10 } });
    const controller = fakeController();
    feed(controller, routine.start);
    const resume = feed(controller, routine.resume);
    assert.ok(resume.some((s) => s.line.includes('[global.toolchange.FEEDRATE]')));
});
