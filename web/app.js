// cncjs-probe: the page. gSender's Probe widget (features/Probe/*.tsx) and tool
// length wizard rebuilt for a CNCjs Custom Widget iframe.
// Copyright (C) 2025 Sienci Labs Inc. (gSender) and Pedro Paulo Vezza Campos.
// GNU General Public License v3.0; see LICENSE.
import {
    GRBL,
    METRIC_UNITS,
    PROBE_TYPE_AUTO,
    PROBE_TYPE_TIP,
    TOUCHPLATE_TYPE_3D,
    TOUCHPLATE_TYPE_AUTOZERO,
    TOUCHPLATE_TYPE_BITZERO,
    TOUCHPLATE_TYPE_STANDARD,
    TOUCHPLATE_TYPE_ZERO,
} from './lib/constants.js';
import { canClick, newTool, offersAutoAndTip, toolDiameterOptions } from './lib/probe-options.js';
import {
    availableCommands,
    effectiveControllerSettings,
    fromDisplay,
    loadSettings,
    saveSettings,
    selectedCommand,
    toDisplay,
    toolLengthRoutine,
    toolchangeContext,
    unitsOf,
    withDiameterChoice,
    withoutTool,
    withPlateType,
    zeroRoutine,
} from './lib/model.js';
import { setControllerSettings, setMachinePosition } from './lib/machine-store.js';
import { TOUCH_LABELS, TOUCH_NONE, connectivityAfter, touchFromPinState } from './lib/touch.js';
import { embeddingOf, joinPort } from './lib/cncjs.js';

const $ = (id) => document.getElementById(id);

const token = new URLSearchParams(location.search).get('token');
const embedding = embeddingOf(window, token);
document.documentElement.dataset.embedding = embedding;

// Reading localStorage throws when the browser blocks site storage; settings then last for the page.
const storage = (() => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
})();
let settings = loadSettings(storage);

// What CNCjs reports. link: standalone | foreign | no-port | connecting | joined | not-open | error
const NO_MACHINE = {
    link: embedding === 'cncjs' ? 'no-port' : embedding,
    linkMessage: '',
    port: null,
    portState: 'closed', // 'open' | 'closed'
    type: null,
    activeState: null,
    workflowState: null,
    feeder: 'idle', // 'idle' | 'busy'
    modalUnits: undefined,
    distance: undefined,
    mpos: {},
    parserstate: null,
    settings: { settings: {} },
    touch: TOUCH_NONE,
};
let machine = { ...NO_MACHINE };
let link = null;

// run: 'closed' | 'open'; connectivity: 'waiting' | 'confirmed'; toolLength: 'ready' | 'started' | 'probed'
const ui = { run: 'closed', connectivity: 'waiting', toolLength: 'ready', message: null };

const PLATE_TYPES = [
    TOUCHPLATE_TYPE_STANDARD,
    TOUCHPLATE_TYPE_AUTOZERO,
    TOUCHPLATE_TYPE_ZERO,
    TOUCHPLATE_TYPE_3D,
    TOUCHPLATE_TYPE_BITZERO,
];
const DIRECTION_LABELS = ['Bottom Left', 'Top Left', 'Top Right', 'Bottom Right'];

// Without a machine the preview assumes Grbl in the preview units, absolute distance.
const routineMachine = () => {
    if (machine.link === 'joined') return machine;
    return { ...machine, type: GRBL, modalUnits: settings.previewUnits === METRIC_UNITS ? 'G21' : 'G20', distance: 'G90' };
};
const units = () => unitsOf(settings, routineMachine());
const reported = () => machine.settings?.settings ?? {};
const portReady = () => machine.link === 'joined' && machine.portState === 'open';
const clickable = () => canClick({
    connected: portReady(),
    workflowState: machine.workflowState,
    type: machine.type,
    activeState: machine.activeState,
}) && machine.feeder !== 'busy';

const syncMachineStore = () => setControllerSettings(effectiveControllerSettings(settings, machine.settings));

const update = (next) => {
    settings = next;
    saveSettings(storage, settings);
    syncMachineStore();
    render();
};

const say = (text, kind = 'info') => {
    ui.message = text ? { text, kind } : null;
};

// ---------- settings fields (gSender's Config > Probe, SettingsMenu.ts) ----------
const zThickness = (key) => ({
    get: (s) => s.probeProfile.zThickness[key],
    set: (s, v) => ({ ...s, probeProfile: { ...s.probeProfile, zThickness: { ...s.probeProfile.zThickness, [key]: v } } }),
});
const probeSetting = (key) => ({
    get: (s) => s.probe[key],
    set: (s, v) => ({ ...s, probe: { ...s.probe, [key]: v } }),
});
// kind: 'len' (mm, shown in machine units) | 'feed' (mm/min) | 'mm' (always mm)
const FIELDS = [
    { id: 'tipDiameter3D', label: 'Tip diameter', kind: 'len', ...probeSetting('tipDiameter3D'), hidden: (p, mode) => mode !== 'zero' || p !== TOUCHPLATE_TYPE_3D, title: 'Diameter of probe tip where it touches off the material. (Default 2)' },
    { id: 'standardBlock', label: 'Block thickness', kind: 'len', ...zThickness('standardBlock'), hidden: (p) => p !== TOUCHPLATE_TYPE_STANDARD, title: 'Plate thickness where the bit touches when Z-axis probing using the Standard Block plate. (Default 15)' },
    { id: 'autoZero', label: 'AutoZero thickness', kind: 'len', ...zThickness('autoZero'), hidden: (p) => p !== TOUCHPLATE_TYPE_AUTOZERO, title: 'Plate thickness where the bit touches when Z-axis probing using the AutoZero plate. (Default 5)' },
    { id: 'zProbe', label: 'Puck thickness', kind: 'len', ...zThickness('zProbe'), hidden: (p) => p !== TOUCHPLATE_TYPE_ZERO, title: 'Plate thickness where the bit touches when Z-axis probing when using the Z Probe plate. (Default 15)' },
    { id: 'probe3D', label: 'Z offset', kind: 'len', range: 'any', ...zThickness('probe3D'), hidden: (p) => p !== TOUCHPLATE_TYPE_3D, title: 'Adjust to improve the Z zeroing accuracy of your probe. (Default 0)' },
    { id: 'bitZero', label: 'BitZero thickness (XYZ)', kind: 'len', ...zThickness('bitZero'), hidden: (p) => p !== TOUCHPLATE_TYPE_BITZERO, title: 'Plate thickness for XYZ probing where the bit touches the inset surface inside the bore. (Default 13)' },
    { id: 'bitZeroZOnly', label: 'BitZero thickness (Z-only)', kind: 'len', ...zThickness('bitZeroZOnly'), hidden: (p) => p !== TOUCHPLATE_TYPE_BITZERO, title: 'Plate thickness for Z-only probing where the probe is placed flat on the surface. (Default 15.5)' },
    { id: 'xyThickness', label: 'XY thickness', kind: 'len', get: (s) => s.probeProfile.xyThickness, set: (s, v) => ({ ...s, probeProfile: { ...s.probeProfile, xyThickness: v } }), hidden: (p, mode) => mode !== 'zero' || p !== TOUCHPLATE_TYPE_STANDARD, title: 'Plate thickness where the bit touches when X/Y-axis probing. (Default 10)' },
    { id: 'xyRetract3D', label: 'XY retract', kind: 'len', ...probeSetting('xyRetract3D'), hidden: (p, mode) => mode !== 'zero' || p !== TOUCHPLATE_TYPE_3D, title: 'How much extra to move off the surface when probing. (Default 10)' },
    { id: 'zProbeDistance', label: 'Z probe distance', kind: 'len', ...probeSetting('zProbeDistance'), hidden: (p, mode) => mode !== 'zero' || offersAutoAndTip(p), title: 'Movement in Z before it gives up on probing. (Reduce this value if you get a soft limit alarm 2 when probing, Default 30)' },
    { id: 'probeFastFeedrate', label: 'Fast find', kind: 'feed', ...probeSetting('probeFastFeedrate'), hidden: (p, mode) => mode === 'zero' && offersAutoAndTip(p), title: 'Probe speed before the first touch-off. (Default 150)' },
    { id: 'probeFeedrate', label: 'Slow find', kind: 'feed', ...probeSetting('probeFeedrate'), hidden: (p, mode) => mode === 'zero' && offersAutoAndTip(p), title: 'Speed for the more accurate second touch-off. (Default 75)' },
    { id: 'retractionDistance', label: 'Retraction', kind: 'len', ...probeSetting('retractionDistance'), hidden: (p, mode) => mode === 'zero' && offersAutoAndTip(p), title: 'How far the bit moves away after a successful touch. (Default 2)' },
    { id: 'probeMovementSpeed', label: 'Probe Movement Speed', kind: 'feed', range: 'nonNegative', ...probeSetting('probeMovementSpeed'), hidden: (p, mode) => mode !== 'zero' || p === TOUCHPLATE_TYPE_BITZERO, title: 'Feed rate for retract/reposition moves during probing. If 0, these moves use rapid (G0). If set, they use a controlled feed move (G1) at this speed instead. (Default 0)' },
    { id: 'zRetractNormal', label: 'Final Z retract', kind: 'len', min: 1, ...probeSetting('zRetractNormal'), hidden: (p, mode) => mode !== 'zero' || offersAutoAndTip(p), title: 'How far to move away in the Z-axis at the end of the routine. (Default 2)' },
    { id: 'zRetractAuto', label: 'Final Z retract', kind: 'len', min: 1, ...probeSetting('zRetractAuto'), hidden: (p, mode) => mode !== 'zero' || p !== TOUCHPLATE_TYPE_AUTOZERO, title: 'How far to move away in the Z-axis at the end of the routine. (Default 1)' },
    { id: 'zMaxTravel', label: 'Z max travel ($132)', kind: 'mm', optional: true, get: (s) => s.zMaxTravel, set: (s, v) => ({ ...s, zMaxTravel: v }), hidden: () => reported().$132 !== undefined, title: 'Your controller does not report $132 (FluidNC 3.x does not). Z travel from home to the bottom, used to limit probe moves like gSender does.' },
];

const unitLabel = (kind) => {
    if (kind === 'mm') return 'mm';
    if (kind === 'feed') return `${units()}/min`;
    return units();
};
const shownValue = (field) => {
    const value = field.get(settings);
    if (value === null || value === undefined) return '';
    if (field.kind === 'mm') return String(value);
    return String(toDisplay(value, units()));
};
const parsedValue = (field, text) => {
    const trimmed = text.trim();
    if (trimmed === '' && field.optional) return { value: null };
    const n = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(n)) return { error: 'Enter a number.' };
    // range: 'positive' (default) | 'nonNegative' | 'any'
    const range = field.range ?? 'positive';
    if (n < 0 && range !== 'any') return { error: 'Must not be negative.' };
    if (n === 0 && range === 'positive') return { error: 'Must be more than 0.' };
    const mm = field.kind === 'mm' ? n : fromDisplay(n, units());
    if (field.min !== undefined && mm < field.min) return { error: `At least ${toDisplay(field.min, units())} ${unitLabel(field.kind)}.` };
    return { value: mm };
};

let fieldsKey = '';
function renderFields() {
    const plate = settings.probeProfile.touchplateType;
    const visible = FIELDS.filter((f) => !f.hidden(plate, settings.mode));
    const key = `${visible.map((f) => f.id).join(',')}|${units()}`;
    const box = $('fields');
    if (key !== fieldsKey) {
        fieldsKey = key;
        box.replaceChildren();
        for (const field of visible) {
            const label = document.createElement('label');
            label.htmlFor = `f-${field.id}`;
            label.title = field.title;
            label.append(`${field.label} `);
            const unit = document.createElement('span');
            unit.className = 'unit';
            unit.textContent = `(${unitLabel(field.kind)})`;
            label.append(unit);
            const input = document.createElement('input');
            input.id = `f-${field.id}`;
            input.className = 'form-control';
            input.inputMode = 'decimal';
            input.dataset.field = field.id;
            input.title = field.title;
            box.append(label, input);
        }
    }
    for (const field of visible) {
        const input = $(`f-${field.id}`);
        if (document.activeElement === input) continue;
        input.value = shownValue(field);
        input.removeAttribute('aria-invalid');
        input.title = field.title;
    }
}

$('fields').addEventListener('input', (e) => {
    const field = FIELDS.find((f) => f.id === e.target.dataset.field);
    if (!field) return;
    const parsed = parsedValue(field, e.target.value);
    if (parsed.error) {
        e.target.setAttribute('aria-invalid', 'true');
        e.target.title = parsed.error;
        return;
    }
    e.target.removeAttribute('aria-invalid');
    e.target.title = field.title;
    update(field.set(settings, parsed.value));
});
$('fields').addEventListener('focusout', () => render());

// ---------- gSender's ProbeImage.tsx ----------
const IMAGES = {
    X: 'Block-X.gif', Y: 'Block-Y.gif', XY: 'Block-XY.gif', XYZ: 'Block-XYZ.gif', Z: 'Block-Z.gif',
    ZOnly: 'Probe-Z.gif', AutoZ: 'AutoZero-Z.gif', AutoXYZ: 'AutoZero-Rem.gif',
    XY3D: '3D-XY.gif', XYZ3D: '3D-XYZ.gif', X3D: '3D-X.gif', Y3D: '3D-Y.gif',
};
const probeImage = (plate, id) => {
    if (offersAutoAndTip(plate)) {
        return id === 'Z Touch' ? IMAGES.AutoZ : IMAGES.AutoXYZ;
    }
    if (plate === TOUCHPLATE_TYPE_ZERO) return IMAGES.ZOnly;
    if (plate === TOUCHPLATE_TYPE_3D) {
        if (id === 'X Touch') return IMAGES.X3D;
        if (id === 'Y Touch') return IMAGES.Y3D;
        if (id === 'XY Touch') return IMAGES.XY3D;
        return IMAGES.XYZ3D;
    }
    if (id === 'X Touch') return IMAGES.X;
    if (id === 'Y Touch') return IMAGES.Y;
    if (id === 'XY Touch') return IMAGES.XY;
    if (id === 'Z Touch') return IMAGES.Z;
    return IMAGES.XYZ;
};

// ---------- rendering ----------
const statusText = () => {
    if (machine.link === 'standalone') return 'Preview only: add this page to CNCjs as a Custom Widget to probe.';
    if (machine.link === 'foreign') return 'Probing needs the widget served by CNCjs itself (same address and port).';
    if (machine.link === 'no-port') return 'Open a port in CNCjs to probe.';
    if (machine.link === 'connecting') return `Connecting to CNCjs for ${machine.port}…`;
    if (machine.link !== 'joined') return machine.linkMessage;
    if (machine.portState !== 'open') return `${machine.port} is closed.`;
    const parts = [machine.port, machine.type ?? 'unknown controller', machine.activeState ?? 'no status yet', machine.modalUnits ?? 'units unknown'];
    if (machine.feeder === 'busy') parts.push('probing');
    return parts.join(' · ');
};

const setPressed = (button, on) => {
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
};

let commandsKey = '';
function renderCommands() {
    const commands = availableCommands(settings);
    const key = commands.map((c) => c.id).join(',');
    const box = $('commands');
    if (key !== commandsKey) {
        commandsKey = key;
        box.replaceChildren(...commands.map((command) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-default btn-sm';
            b.dataset.command = command.id;
            b.title = `Probe using ${command.id}`;
            b.textContent = command.id.split(' ')[0];
            return b;
        }));
    }
    const current = selectedCommand(settings);
    for (const b of box.children) setPressed(b, b.dataset.command === current.id);
}

const diameterKey = () => (units() === METRIC_UNITS ? 'metricDiameter' : 'imperialDiameter');
const diameterValue = () => {
    if (settings.probeType === PROBE_TYPE_AUTO || settings.probeType === PROBE_TYPE_TIP) return settings.probeType;
    return settings.tool ? String(settings.tool[diameterKey()]) : '';
};
// Rebuilt only when the list changes: CNCjs status reports re-render several
// times a second, and replacing the options would close an open dropdown.
let diameterOptionsKey = '';
function renderDiameter() {
    const plate = settings.probeProfile.touchplateType;
    const options = toolDiameterOptions(settings.tools, units(), plate);
    const value = diameterValue();
    // the selected tool may have been removed from the list
    if (value && !options.some((o) => o.value === value)) options.push({ value, label: value, tool: settings.tool });
    const select = $('diameter');
    const key = `${units()}|${options.map((o) => o.value).join(',')}`;
    if (key !== diameterOptionsKey) {
        diameterOptionsKey = key;
        select.replaceChildren(...options.map((o) => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.tool ? `${o.label} ${units()}` : o.label;
            return opt;
        }));
    }
    if (select.value !== value) select.value = value;
    $('diameter-new').placeholder = `Custom diameter (${units()})`;
    const deletable = options.length > 1 && settings.tools.some((t) => String(t[diameterKey()]) === value);
    $('diameter-delete').disabled = !deletable;
}

function renderRunPanel(command) {
    const plate = settings.probeProfile.touchplateType;
    const is3D = plate === TOUCHPLATE_TYPE_3D;
    const direction = Number(settings.probe.direction);
    $('run').hidden = ui.run !== 'open';
    $('run-title').textContent = `Probe - ${command.id}`;
    $('direction-warning').hidden = direction === 0;
    $('direction-warning').textContent = `Warning - Probing ${DIRECTION_LABELS[direction] ?? 'Unknown'} corner. Verify this is correct before starting.`;
    $('step-circuit').textContent = is3D
        ? 'Gently push the probe needle to check the circuit is triggered properly (indicated by a green light).'
        : 'Lift your touch plate to the tool to check the circuit is good (indicated by a green light), then put it back where it was.';
    $('step-hold').hidden = is3D;
    $('probe-start').disabled = ui.connectivity !== 'confirmed' || !clickable();
    $('circuit-wait').hidden = ui.connectivity === 'confirmed';
}

function renderToolLength(routine) {
    for (const input of document.querySelectorAll('[data-tl]')) {
        if (document.activeElement === input) continue;
        const v = tlValue(input.dataset.tl);
        input.value = Number.isFinite(v) ? String(v) : '';
        input.removeAttribute('aria-invalid');
    }
    const ok = clickable() && !routine.reason;
    $('tl-here').disabled = machine.link !== 'joined' || !machine.mpos || machine.mpos.z === undefined;
    $('tl-start').disabled = !ok || ui.toolLength !== 'ready';
    $('tl-cancel').disabled = ui.toolLength === 'ready';
    $('tl-probe').disabled = !ok || ui.toolLength === 'ready' || ui.connectivity !== 'confirmed';
    $('tl-resume').disabled = !ok || ui.toolLength !== 'probed';
    const note = routine.reason
        ?? (ui.toolLength === 'ready' ? 'Start stores the current position and spindle state, stops the spindle and raises Z.'
            : ui.toolLength === 'started' && ui.connectivity !== 'confirmed' ? 'Touch the toolsetter to check its circuit, then probe.'
                : ui.toolLength === 'started' ? 'Probe moves to the sensor and measures the tool.'
                    : 'Tool length stored as global.toolchange.TOOL_OFFSET. Resume returns to where you started.');
    $('tl-note').textContent = note;
}

function render() {
    const plate = settings.probeProfile.touchplateType;
    const command = selectedCommand(settings);
    $('status').textContent = statusText();
    for (const b of document.querySelectorAll('[data-mode]')) setPressed(b, b.dataset.mode === settings.mode);
    $('units-row').hidden = machine.link === 'joined';
    for (const b of document.querySelectorAll('[data-units]')) setPressed(b, b.dataset.units === settings.previewUnits);

    const select = $('plate');
    if (!select.options.length) {
        select.replaceChildren(...PLATE_TYPES.map((t) => new Option(t, t)));
    }
    if (select.value !== plate) select.value = plate;

    const touch = $('touch');
    touch.dataset.touch = machine.touch;
    touch.dataset.link = portReady() ? 'on' : 'off';
    $('touch-text').textContent = portReady() ? TOUCH_LABELS[machine.touch] : 'No device connected';
    $('connectivity-test').checked = Boolean(settings.probe.connectivityTest);

    $('zero').hidden = settings.mode !== 'zero';
    $('tool-length').hidden = settings.mode !== 'toolLength';

    renderCommands();
    $('corner-row').hidden = plate === TOUCHPLATE_TYPE_ZERO;
    for (const b of document.querySelectorAll('[data-direction]')) setPressed(b, Number(b.dataset.direction) === Number(settings.probe.direction));
    $('diameter-row').hidden = !command.tool;
    renderDiameter();
    const image = new URL(`./assets/${probeImage(plate, command.id)}`, import.meta.url).href;
    if ($('probe-image').src !== image) $('probe-image').src = image;

    const zero = zeroRoutine(settings, routineMachine());
    $('probe-open').disabled = !clickable() || Boolean(zero.reason);
    $('stop').hidden = machine.feeder !== 'busy';
    renderRunPanel(command);

    const toolLength = toolLengthRoutine(settings);
    renderToolLength(toolLength);

    renderFields();

    const message = $('message');
    message.hidden = !ui.message;
    message.className = `message alert alert-${ui.message?.kind ?? 'info'}`;
    message.textContent = ui.message?.text ?? '';

    renderCode(zero, toolLength);
}

// Assigned only on change: CNCjs status reports re-render several times a second,
// and rewriting the text would clear a selection in the preview.
const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
};
function renderCode(zero, toolLength) {
    const assumed = machine.link === 'joined' ? '' : ` Without a machine this assumes Grbl in ${settings.previewUnits === METRIC_UNITS ? 'G21' : 'G20'}, G90.`;
    if (settings.mode === 'zero') {
        setText($('code-note'), zero.reason ?? `Sent to CNCjs when you start the probe.${assumed}`);
        setText($('gcode'), zero.lines ? zero.lines.join('\n') : '');
        return;
    }
    setText($('code-note'), toolLength.reason ?? ['Each step sends its block. G-code expressions are evaluated by CNCjs.', toolLength.note].filter(Boolean).join(' '));
    if (toolLength.reason) {
        setText($('gcode'), '');
        return;
    }
    setText($('gcode'), [
        '; Start', ...toolLength.start,
        '', '; Probe tool length', ...toolLength.probe,
        '', '; Resume', ...toolLength.resume,
    ].join('\n'));
}

// ---------- actions ----------
const send = (lines, context) => {
    if (!link || !portReady()) return false;
    if (context) return link.command('gcode', lines, context);
    return link.command('gcode', lines);
};

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    ui.run = 'closed';
    say(null);
    update({ ...settings, mode: b.dataset.mode });
}));
document.querySelectorAll('[data-units]').forEach((b) => b.addEventListener('click', () => update({ ...settings, previewUnits: b.dataset.units })));
$('plate').addEventListener('change', (e) => update(withPlateType(settings, e.target.value)));
$('connectivity-test').addEventListener('change', (e) => {
    update({ ...settings, probe: { ...settings.probe, connectivityTest: e.target.checked } });
    restartConnectivityTest();
    render();
});
$('commands').addEventListener('click', (e) => {
    const id = e.target.closest('[data-command]')?.dataset.command;
    if (!id) return;
    update({ ...settings, command: id });
});
$('corners').addEventListener('click', (e) => {
    const direction = e.target.closest('[data-direction]')?.dataset.direction;
    if (direction === undefined) return;
    update({ ...settings, probe: { ...settings.probe, direction: Number(direction) } });
});
$('diameter').addEventListener('change', (e) => {
    const value = e.target.value;
    const tool = settings.tools.find((t) => String(t[diameterKey()]) === value) ?? settings.tool;
    update(withDiameterChoice(settings, value, tool));
});
const addDiameter = () => {
    const input = $('diameter-new');
    const n = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(n) || n <= 0) {
        input.setAttribute('aria-invalid', 'true');
        return;
    }
    input.removeAttribute('aria-invalid');
    input.value = '';
    const existing = settings.tools.find((t) => t[diameterKey()] === n);
    if (existing) {
        update(withDiameterChoice(settings, String(n), existing));
        return;
    }
    const tool = newTool(n, units());
    update(withDiameterChoice({ ...settings, tools: [...settings.tools, tool] }, String(n), tool));
};
$('diameter-add').addEventListener('click', addDiameter);
$('diameter-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDiameter();
});
$('diameter-delete').addEventListener('click', () => update(withoutTool(settings, diameterValue(), units())));

// gSender's startConnectivityTest: watching starts over each time the dialog opens.
function restartConnectivityTest() {
    ui.connectivity = connectivityAfter({ connectivityTest: settings.probe.connectivityTest, confirmed: 'waiting', touch: machine.touch });
}

$('probe-open').addEventListener('click', () => {
    ui.run = 'open';
    restartConnectivityTest();
    say(null);
    render();
});
$('probe-cancel').addEventListener('click', () => {
    ui.run = 'closed';
    render();
});
$('probe-start').addEventListener('click', () => {
    const routine = zeroRoutine(settings, routineMachine());
    if (routine.reason || ui.connectivity !== 'confirmed' || !clickable()) return;
    ui.run = 'closed';
    say(send(routine.lines) ? 'Initiated probing cycle' : 'Not sent: CNCjs is not connected.', 'info');
    render();
});
$('stop').addEventListener('click', () => {
    if (!link) return;
    link.command('feeder:stop');
    link.command('feedhold');
    say('Probing stopped: the machine is in feed hold. Reset or resume it from CNCjs.', 'warning');
    render();
});

// data-tl: 'x' | 'y' | 'z' (sensor location) | 'safeZ', all machine mm
const tlValue = (key) => (key === 'safeZ' ? settings.safeZ : settings.toolChangePosition[key]);
const withTlValue = (key, n) => (key === 'safeZ'
    ? { ...settings, safeZ: n }
    : { ...settings, toolChangePosition: { ...settings.toolChangePosition, [key]: n } });
document.querySelectorAll('[data-tl]').forEach((input) => input.addEventListener('input', () => {
    const text = input.value.trim();
    const n = Number(text);
    if (!text || !Number.isFinite(n)) {
        input.setAttribute('aria-invalid', 'true');
        return;
    }
    input.removeAttribute('aria-invalid');
    update(withTlValue(input.dataset.tl, n));
}));
document.querySelectorAll('[data-tl]').forEach((input) => input.addEventListener('focusout', () => render()));
$('tl-here').addEventListener('click', () => {
    // status MPos is in report units: inches when $13=1
    const scale = reported().$13 === '1' ? 25.4 : 1;
    const at = (axis) => Number((Number(machine.mpos?.[axis]) * scale).toFixed(3));
    const position = { x: at('x'), y: at('y'), z: at('z') };
    if (![position.x, position.y, position.z].every(Number.isFinite)) return;
    update({ ...settings, toolChangePosition: position });
});
const toolLengthStep = (step) => {
    const routine = toolLengthRoutine(settings);
    if (routine.reason || !clickable()) return;
    const context = toolchangeContext(machine.parserstate);
    if (step === 'start') {
        if (ui.toolLength !== 'ready' || !send(routine.start, context)) return;
        ui.toolLength = 'started';
        restartConnectivityTest();
        say('Tool probe initiated.', 'info');
    }
    if (step === 'probe') {
        if (ui.connectivity !== 'confirmed' || !send(routine.probe, context)) return;
        ui.toolLength = 'probed';
        say('Probing tool length.', 'info');
    }
    if (step === 'resume') {
        if (!send(routine.resume, context)) return;
        ui.toolLength = 'ready';
        say('Returning to the starting position.', 'info');
    }
    render();
};
$('tl-start').addEventListener('click', () => toolLengthStep('start'));
$('tl-probe').addEventListener('click', () => toolLengthStep('probe'));
$('tl-resume').addEventListener('click', () => toolLengthStep('resume'));
// Leaves the wizard without sending anything, so Start can store a new position.
$('tl-cancel').addEventListener('click', () => {
    ui.toolLength = 'ready';
    say(null);
    render();
});

// ---------- CNCjs ----------
function onCncjs(name, ...args) {
    if (name === 'link') {
        const [state, message] = args;
        machine = { ...machine, link: state, linkMessage: message };
    }
    if (name === 'serialport:open') machine = { ...machine, portState: 'open' };
    if (name === 'serialport:close') machine = { ...machine, portState: 'closed', activeState: null, touch: TOUCH_NONE };
    if (name === 'controller:settings') {
        machine = { ...machine, settings: args[1] ?? { settings: {} } };
        syncMachineStore();
    }
    if (name === 'controller:state') {
        const [type, state] = args;
        machine = {
            ...machine,
            type,
            activeState: state?.status?.activeState ?? null,
            mpos: state?.status?.mpos ?? {},
            modalUnits: state?.parserstate?.modal?.units,
            distance: state?.parserstate?.modal?.distance,
            parserstate: state?.parserstate ?? null,
            touch: touchFromPinState(state?.status?.pinState),
        };
        setMachinePosition(machine.mpos);
        const watching = ui.run === 'open' || ui.toolLength === 'started';
        if (watching) ui.connectivity = connectivityAfter({ connectivityTest: settings.probe.connectivityTest, confirmed: ui.connectivity, touch: machine.touch });
    }
    if (name === 'workflow:state') machine = { ...machine, workflowState: args[0] };
    if (name === 'feeder:status') {
        const status = args[0] ?? {};
        machine = { ...machine, feeder: status.queue > 0 || status.pending ? 'busy' : 'idle' };
    }
    render();
}

function usePort(port) {
    if (port === machine.port && link) return;
    if (link) link.close();
    link = null;
    ui.run = 'closed';
    ui.toolLength = 'ready';
    machine = { ...NO_MACHINE, port, link: port ? 'connecting' : 'no-port' };
    syncMachineStore();
    setMachinePosition({});
    if (port) link = joinPort({ token: cncjsToken, port, onEvent: onCncjs });
    render();
}

// Served by CNCjs, wear CNCjs's own stylesheet (Bootstrap 3 and its theme) instead of the stand-in.
function adoptCncjsStyles() {
    const sheets = [...window.parent.document.querySelectorAll('link[rel="stylesheet"][href]')];
    if (!sheets.length) return;
    const fallback = $('cncjs-fallback');
    // A sheet that fails to load keeps the stand-in, so the widget is never left unstyled.
    let pending = sheets.length;
    let failed = 0;
    const settle = () => {
        pending -= 1;
        if (pending) return;
        if (failed) {
            console.warn(`cncjs-probe: ${failed} CNCjs stylesheet(s) failed to load; keeping the stand-in styles.`);
            return;
        }
        fallback.remove();
        render();
    };
    for (const sheet of sheets) {
        const el = document.createElement('link');
        el.rel = 'stylesheet';
        el.href = sheet.href;
        if (sheet.media) el.media = sheet.media;
        el.addEventListener('load', settle);
        el.addEventListener('error', () => {
            failed += 1;
            el.remove();
            settle();
        });
        document.head.insertBefore(el, fallback);
    }
}

let cncjsToken = token;
if (embedding === 'cncjs') {
    adoptCncjsStyles();
    window.addEventListener('message', (e) => {
        if (e.source !== window.parent || e.origin !== location.origin) return;
        const msg = e.data || {};
        if (typeof msg.token === 'string' && msg.token && msg.token !== cncjsToken) {
            cncjsToken = msg.token;
        }
        const a = msg.action || {};
        if (a.type !== 'change' || !a.payload || !Object.hasOwn(a.payload, 'port')) return;
        usePort(a.payload.port || null);
    });
    window.parent.postMessage({ token, action: { type: 'connect' } }, location.origin);
}

syncMachineStore();
render();
