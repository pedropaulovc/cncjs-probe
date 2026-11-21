// The widget's settings and what it sends, kept apart from the page so it can be
// tested without a browser. Lengths and feeds are stored in mm and mm/min, as
// gSender stores them; the page shows them in the machine's units.
import {
    METRIC_UNITS,
    IMPERIAL_UNITS,
    PROBE_TYPE_AUTO,
    PROBE_TYPE_DIAMETER,
    PROBE_TYPE_TIP,
    TOUCHPLATE_TYPE_BITZERO,
    TOUCHPLATE_TYPE_ZERO,
} from './constants.js';
import {
    DEFAULT_PROBE_PROFILE,
    DEFAULT_PROBE_SETTINGS,
    DEFAULT_TOOL,
    DEFAULT_TOOL_CHANGE_POSITION,
    DEFAULT_TOOLS,
    calcProbeType,
    calcToolDiameter,
    gcodeSafe,
    generatePossibleProbeCommands,
    generateProbeCommands,
    getProbeSettings,
    offersAutoAndTip,
} from './probe-options.js';
import createWizard from './probe-tool-length.js';
import { positionsInMm } from './cncjs-adapt.js';
import { get, getState } from './machine-store.js';
import { convertToImperial, in2mm } from './units.js';

export const STORAGE_KEY = 'cncjs-probe:settings';

export const defaultSettings = () => ({
    mode: 'zero', // 'zero' | 'toolLength'
    probeProfile: structuredClone(DEFAULT_PROBE_PROFILE),
    probe: structuredClone(DEFAULT_PROBE_SETTINGS),
    tools: structuredClone(DEFAULT_TOOLS),
    command: 'Z Touch',
    probeType: calcProbeType(DEFAULT_PROBE_PROFILE.touchplateType),
    tool: structuredClone(DEFAULT_TOOLS[0]),
    toolChangePosition: structuredClone(DEFAULT_TOOL_CHANGE_POSITION),
    // Stands in for $132 when the controller does not report it (FluidNC's $$ does not).
    zMaxTravel: null,
    // Units of the preview while no machine reports its own.
    previewUnits: METRIC_UNITS,
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Stored values over the defaults, key by key, so a setting added later gets its default.
const mergeOver = (base, saved) => {
    if (!isObject(saved)) return base;
    const out = { ...base };
    for (const key of Object.keys(base)) {
        if (!(key in saved)) continue;
        out[key] = isObject(base[key]) ? mergeOver(base[key], saved[key]) : saved[key];
    }
    return out;
};

export const loadSettings = (storage) => {
    const base = defaultSettings();
    let saved = null;
    try {
        saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    } catch {
        return base;
    }
    const merged = mergeOver(base, saved);
    // tools and tool are values, not records to merge
    if (Array.isArray(saved?.tools)) merged.tools = saved.tools.filter(validTool);
    if (saved && 'tool' in saved) merged.tool = validTool(saved.tool) ? saved.tool : null;
    return merged;
};

const validTool = (tool) => isObject(tool) && Number.isFinite(tool.metricDiameter) && Number.isFinite(tool.imperialDiameter);

export const saveSettings = (storage, settings) => {
    try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // storage full or blocked: settings last for this page only
    }
};

const MODAL_UNITS = { G20: IMPERIAL_UNITS, G21: METRIC_UNITS };

// The units routines run in: the machine's G20/G21, or the preview choice without one.
export const unitsOf = (settings, machine) => MODAL_UNITS[machine.modalUnits] ?? settings.previewUnits;

// mm -> what the page shows in `units`, and back. Inch values keep gSender's 3 decimals.
export const toDisplay = (mm, units) => (units === METRIC_UNITS ? mm : convertToImperial(mm));
export const fromDisplay = (value, units) => (units === METRIC_UNITS ? value : in2mm(value));

export const availableCommands = (settings) => generatePossibleProbeCommands(settings.probeProfile.touchplateType);

export const selectedCommand = (settings) => {
    const commands = availableCommands(settings);
    return commands.find((c) => c.id === settings.command) ?? commands[0];
};

// index.tsx onStoreChange: the Z Probe plate only probes Z; leaving a plate that
// probed with Auto or Tip goes back to a tool diameter, with gSender's default tool.
export const withPlateType = (settings, plateType) => {
    const next = { ...settings, probeProfile: { ...settings.probeProfile, touchplateType: plateType } };
    if (plateType === TOUCHPLATE_TYPE_ZERO) next.command = 'Z Touch';
    if (offersAutoAndTip(plateType)) return next;
    if (next.probeType === PROBE_TYPE_AUTO || next.probeType === PROBE_TYPE_TIP) {
        next.probeType = PROBE_TYPE_DIAMETER;
        next.tool = { ...DEFAULT_TOOL };
    }
    return next;
};

// ProbeDiameter.tsx handleChange: Auto / Tip, or a tool from the list.
export const withDiameterChoice = (settings, value, tool) => {
    if (value === PROBE_TYPE_AUTO || value === PROBE_TYPE_TIP) {
        return { ...settings, probeType: value, tool: null };
    }
    return { ...settings, probeType: PROBE_TYPE_DIAMETER, tool };
};

export const toolDiameterOf = (settings, units) => calcToolDiameter(settings.probeType, units, settings.tool);

// The machine settings the ported code reads ($13, $22, $132), with the widget's
// Z max travel standing in for an unreported $132.
export const effectiveControllerSettings = (settings, machineSettings) => {
    const reported = machineSettings?.settings ?? {};
    if (reported.$132 !== undefined || settings.zMaxTravel === null) {
        return { ...machineSettings, settings: reported };
    }
    return { ...machineSettings, settings: { ...reported, $132: String(settings.zMaxTravel) } };
};

// The lines the Probe button sends, as gSender's runProbeCommands sends them
// through 'gcode:safe' with G21. Returns { lines } or { reason }.
export const zeroRoutine = (settings, machine) => {
    const units = unitsOf(settings, machine);
    const reported = machine.settings?.settings ?? {};
    const $13 = reported.$13 ?? '0';
    const code = generateProbeCommands({
        probeCommand: selectedCommand(settings),
        units,
        touchplate: settings.probeProfile,
        probe: settings.probe,
        toolDiameter: toolDiameterOf(settings, units),
        probeType: settings.probeType,
        direction: Number(settings.probe.direction),
        $13,
        $22: reported.$22 ?? '0',
        firmware: machine.type,
        distance: machine.distance,
    });
    // BitZero centres on captured positions under G21
    const adapted = settings.probeProfile.touchplateType === TOUCHPLATE_TYPE_BITZERO ? positionsInMm(code, $13) : code;
    const lines = gcodeSafe(adapted, 'G21', machine.modalUnits);
    if (!lines) return { reason: 'Waiting for the machine to report its units (G20/G21).' };
    return { lines: lines.filter((line) => typeof line === 'string') };
};

// gSender's server puts the program feed rate and spindle speed in the macro
// context; CNCjs 1.11.5 does not, so the widget passes them with the command.
export const toolchangeContext = (parserstate) => ({
    programFeedrate: `F${parserstate?.feedrate}`,
    spindleRate: `${parserstate?.spindle}`,
});

// The tool length wizard's three steps. Returns { start, probe, resume } or { reason }.
export const toolLengthRoutine = (settings) => {
    const position = settings.toolChangePosition;
    if (![position.x, position.y, position.z].every(Number.isFinite)) {
        return { reason: 'Set the sensor location first.' };
    }
    const captured = [];
    const wizard = createWizard({
        controller: { command: (cmd, lines) => captured.push(lines) },
        settings: getProbeSettings(settings.probeProfile, settings.probe),
        position,
    });
    wizard.onStart();
    const start = captured[0];
    const distance = start.find((line) => line.startsWith('%global.toolchange.PROBE_DISTANCE='));
    const value = Number(distance.split('=')[1]);
    if (!Number.isFinite(value) || value <= 0) {
        return { reason: 'No room to probe: Z max travel ($132) is unknown or the sensor Z is past it. Set Z max travel under Settings.' };
    }
    // the wizard keeps positions for G21 moves
    const $13 = get(getState(), 'controller.settings.settings.$13', '0');
    return {
        start: positionsInMm(start, $13),
        probe: positionsInMm(wizard.steps[0].substeps[0].actions[0].gcodeLines, $13),
        resume: positionsInMm(wizard.steps[1].substeps[0].actions[0].gcodeLines, $13),
    };
};
