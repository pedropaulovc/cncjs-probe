/*
 * Ported from gSender:
 *   src/app/src/features/Probe/index.tsx (probe routines on offer, tool diameter,
 *     the options handed to getProbeCode, Run gating)
 *   src/app/src/lib/toolChangeUtils.ts (getProbeSettings)
 *   src/app/src/store/defaultState/index.ts (probe defaults and tool list)
 *   src/server/controllers/Grbl/GrblController.js ('gcode:safe' command)
 * https://github.com/Sienci-Labs/gsender/tree/e73082afb83ee2377ed2077537c45fec33efaba0/src
 * Copyright (C) 2021 Sienci Labs Inc.
 *
 * This file is part of cncjs-probe and, like gSender, is free software: you
 * can redistribute it and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software Foundation, under version
 * 3 of the License. It is distributed WITHOUT ANY WARRANTY; see LICENSE.
 *
 * Modified: ported to JS (browser ES module). The React component's state is
 * passed in as plain arguments instead of hooks and gSender's stores; CNCjs
 * has no 'gcode:safe' command, so gcodeSafe() builds the same line list on the
 * client for a plain 'gcode' command.
 */
import {
    GRBL,
    GRBLHAL,
    GRBL_ACTIVE_STATE_IDLE,
    METRIC_UNITS,
    PROBE_TYPE_AUTO,
    PROBE_TYPE_DIAMETER,
    PROBE_TYPE_TIP,
    TOUCHPLATE_TYPE_3D,
    TOUCHPLATE_TYPE_AUTOZERO,
    TOUCHPLATE_TYPE_BITZERO,
    TOUCHPLATE_TYPE_ZERO,
    WORKFLOW_STATE_RUNNING,
} from './constants.js';
import { getProbeCode } from './probing.js';
import { convertToImperial } from './units.js';

// store/defaultState/index.ts: workspace.probeProfile
export const DEFAULT_PROBE_PROFILE = {
    xyThickness: 10,
    zThickness: {
        standardBlock: 15,
        autoZero: 5,
        zProbe: 15,
        probe3D: 0,
        bitZero: 13,
        bitZeroZOnly: 15.5,
    },
    plateWidth: 50,
    plateLength: 50,
    functions: {
        x: true,
        y: true,
        z: true,
    },
    touchplateType: 'Standard Block',
};

// store/defaultState/index.ts: widgets.probe (the settings the Probe tool reads)
export const DEFAULT_PROBE_SETTINGS = {
    connectivityTest: true,
    probeFeedrate: 75,
    probeFastFeedrate: 150,
    retractionDistance: 2,
    zRetractNormal: 2,
    zRetractAuto: 1,
    zProbeDistance: 30,
    direction: 0,
    tipDiameter3D: 2,
    xyRetract3D: 10,
    probeMovementSpeed: 0,
};

// store/defaultState/index.ts: workspace.tools
export const DEFAULT_TOOLS = [
    { metricDiameter: 6.35, imperialDiameter: 0.25, type: 'end mill' },
    { metricDiameter: 3.175, imperialDiameter: 0.125, type: 'end mill' },
    { metricDiameter: 9.525, imperialDiameter: 0.375, type: 'end mill' },
    { metricDiameter: 12.7, imperialDiameter: 0.5, type: 'end mill' },
    { metricDiameter: 15.875, imperialDiameter: 0.625, type: 'end mill' },
];

// store/defaultState/index.ts: workspace.toolChangePosition (machine coordinates, mm)
export const DEFAULT_TOOL_CHANGE_POSITION = { x: 0, y: 0, z: 0 };

// index.tsx: defaultTool
export const DEFAULT_TOOL = {
    metricDiameter: 6.35,
    imperialDiameter: 0.25,
    type: '',
};

// index.tsx: actions.generatePossibleProbeCommands
export const generatePossibleProbeCommands = (touchplateType) => {
    const commands = [];
    let command;
    const functions = {
        z: false,
        y: false,
        x: false,
    };

    const is3D = touchplateType === TOUCHPLATE_TYPE_3D;

    if (touchplateType === TOUCHPLATE_TYPE_ZERO) {
        functions.z = true;
    } else {
        functions.z = true;
        functions.y = true;
        functions.x = true;
    }

    //Z
    if (functions.z) {
        command = {
            id: 'Z Touch',
            safe: false,
            tool: false,
            axes: {
                x: false,
                y: false,
                z: true,
            },
        };
        commands.push(command);
    }

    if (functions.x && functions.y) {
        if (functions.z) {
            command = {
                id: 'XYZ Touch',
                safe: true,
                tool: is3D ? false : true,
                axes: {
                    x: true,
                    y: true,
                    z: true,
                },
            };
            commands.push(command);
        }

        command = {
            id: 'XY Touch',
            safe: true,
            tool: is3D ? false : true,
            axes: {
                x: true,
                y: true,
                z: false,
            },
        };
        commands.push(command);

        command = {
            id: 'X Touch',
            safe: true,
            tool: is3D ? false : true,
            axes: {
                x: true,
                y: false,
                z: false,
            },
        };
        commands.push(command);

        command = {
            id: 'Y Touch',
            safe: true,
            tool: is3D ? false : true,
            axes: {
                x: false,
                y: true,
                z: false,
            },
        };
        commands.push(command);
    }
    return commands;
};

// index.tsx: calcProbeType
export const calcProbeType = (touchplateType) => {
    if (touchplateType === TOUCHPLATE_TYPE_AUTOZERO) {
        return PROBE_TYPE_AUTO;
    }
    return PROBE_TYPE_DIAMETER;
};

// index.tsx: calcToolDiamater. Auto and Tip probe with no diameter; otherwise the
// current tool's diameter in the given units.
export const calcToolDiameter = (probeType, units, currentTool) => {
    const defaultToolDiameter = units === METRIC_UNITS ? 6.35 : 0.25;
    if (probeType === PROBE_TYPE_AUTO || probeType === PROBE_TYPE_TIP) {
        return 0.0;
    }
    if (!currentTool) {
        return defaultToolDiameter;
    }
    return currentTool[
        units === METRIC_UNITS ? 'metricDiameter' : 'imperialDiameter'
    ];
};

// ProbeDiameter.tsx: the diameter list. AutoZero and BitZero also offer Auto and
// Tip; numbers sort ascending after the names.
export const toolDiameterOptions = (tools, units, touchplateType) => {
    const key = units === METRIC_UNITS ? 'metricDiameter' : 'imperialDiameter';
    const baseOptions = [];
    if (
        touchplateType === TOUCHPLATE_TYPE_AUTOZERO ||
        touchplateType === TOUCHPLATE_TYPE_BITZERO
    ) {
        baseOptions.push(
            { value: PROBE_TYPE_AUTO, label: PROBE_TYPE_AUTO, tool: null },
            { value: PROBE_TYPE_TIP, label: PROBE_TYPE_TIP, tool: null },
        );
    }
    baseOptions.push(
        ...tools.map((tool) => ({
            value: String(tool[key]),
            label: String(tool[key]),
            tool,
        })),
    );
    return baseOptions.sort((a, b) => {
        const isNumR = /^\d+.?\d*$/;
        const isANum = isNumR.test(a.value);
        const isBNum = isNumR.test(b.value);
        if (isANum && isBNum) {
            return Number(a.value) - Number(b.value);
        }
        if (!isANum && !isBNum) {
            return a.value.localeCompare(b.value);
        }
        return isANum ? 1 : -1;
    });
};

// ProbeDiameter.tsx: handleCreateOption's new tool, in both units.
export const newTool = (value, units) => ({
    metricDiameter:
        units === METRIC_UNITS ? value : Number((value * 25.4).toFixed(3)),
    imperialDiameter:
        units === METRIC_UNITS ? Number((value / 25.4).toFixed(3)) : value,
    type: 'End Mill',
});

// index.tsx: generateProbeCommands. All lengths and feeds in `probe` and
// `touchplate` are stored in mm as gSender stores them; `units` is the units
// the routine runs in ('mm' or 'in'); `toolDiameter` is already in `units`.
export const generateProbeCommands = ({
    probeCommand,
    units,
    touchplate,
    probe,
    toolDiameter,
    probeType,
    direction,
    $13,
    $22,
    firmware,
    distance,
}) => {
    const { axes } = probeCommand;
    const {
        probeFeedrate,
        probeFastFeedrate,
        retractionDistance,
        zRetractNormal: zRetractDistance,
        zRetractAuto: zRetractDistanceAuto,
        zProbeDistance,
        tipDiameter3D,
        xyRetract3D,
        probeMovementSpeed,
    } = probe;
    const PROBE_DISTANCE_METRIC = {
        x: 30,
        y: 30,
        z: zProbeDistance ? zProbeDistance : 30,
    };
    const PROBE_DISTANCE_IMPERIAL = {
        x: 1.2,
        y: 1.2,
        z: zProbeDistance ? convertToImperial(zProbeDistance) : 1.2,
    };
    let probeDistances =
        units === METRIC_UNITS
            ? PROBE_DISTANCE_METRIC
            : PROBE_DISTANCE_IMPERIAL;
    // Grab units for correct modal
    let zThickness,
        xyThickness,
        feedrate,
        fastFeedrate,
        retractDistance,
        zRetractNormal,
        tipDiameter,
        xyRetract,
        movementSpeed;
    const modal = units === METRIC_UNITS ? '21' : '20';
    if (units === METRIC_UNITS) {
        zThickness = touchplate.zThickness;
        xyThickness = touchplate.xyThickness;
        feedrate = probeFeedrate;
        fastFeedrate = probeFastFeedrate;
        retractDistance = retractionDistance;
        zRetractNormal = zRetractDistance;
        tipDiameter = tipDiameter3D;
        xyRetract = xyRetract3D;
        movementSpeed = probeMovementSpeed;
    } else {
        zThickness = {
            autoZero: touchplate.zThickness.autoZero, // don't convert - this is the only user adjusted var in autozero, so everything else is in mm
            standardBlock: convertToImperial(
                touchplate.zThickness.standardBlock,
            ),
            zProbe: convertToImperial(touchplate.zThickness.zProbe),
            probe3D: convertToImperial(touchplate.zThickness.probe3D),
        };
        xyThickness = convertToImperial(touchplate.xyThickness);
        feedrate = convertToImperial(probeFeedrate);
        fastFeedrate = convertToImperial(probeFastFeedrate);
        retractDistance = convertToImperial(retractionDistance);
        zRetractNormal = convertToImperial(zRetractDistance);
        tipDiameter = convertToImperial(tipDiameter3D);
        xyRetract = convertToImperial(xyRetract3D);
        movementSpeed = probeMovementSpeed
            ? convertToImperial(probeMovementSpeed)
            : 0;
    }

    const options = {
        axes,
        modal,
        probeFast: fastFeedrate,
        probeSlow: feedrate,
        units,
        retract: retractDistance,
        zRetractNormal,
        zRetractAuto: zRetractDistanceAuto,
        toolDiameter,
        zThickness,
        xyThickness,
        plateType: touchplate.touchplateType,
        $13,
        probeDistances,
        probeType,
        homingEnabled: $22 !== '0',
        tipDiameter3D: tipDiameter,
        xyRetract3D: xyRetract,
        probeMovementSpeed: movementSpeed,
        // AutoZero always runs in mm (forced G21), so pass the raw,
        // unconverted mm/min value regardless of display units
        probeMovementSpeedAuto: probeMovementSpeed,
        firmware,
    };

    const code = getProbeCode(options, direction);
    code.push(distance);

    return code;
};

// GrblController.js 'gcode:safe': run the commands in the preferred units and
// put the machine back in its own units afterwards. Returns null when the
// machine's units are unknown (upstream logs and sends nothing).
export const gcodeSafe = (commands, prefUnits, deviceUnits) => {
    let code = [];

    if (!deviceUnits) {
        return null;
    }
    // Force command in preferred units
    if (prefUnits !== deviceUnits) {
        code.push(prefUnits);
    }
    code = code.concat(commands);
    // return modal to previous state if they were different previously
    if (prefUnits !== deviceUnits) {
        code = code.concat(deviceUnits);
    }
    return code;
};

// index.tsx: canClick. 'connected' means a port is open in CNCjs.
export const canClick = ({ connected, workflowState, type, activeState }) => {
    if (!connected) {
        return false;
    }
    if (workflowState === WORKFLOW_STATE_RUNNING) {
        return false;
    }
    if (![GRBL, GRBLHAL].includes(type)) {
        return false;
    }
    return activeState === GRBL_ACTIVE_STATE_IDLE;
};

// toolChangeUtils.ts: getProbeSettings, the probe values the tool length wizard uses.
export const getProbeSettings = (probeProfile, probeSettings) => {
    const touchplateType = probeProfile.touchplateType;

    let probeThickness = probeProfile.zThickness.standardBlock;
    if (touchplateType === TOUCHPLATE_TYPE_AUTOZERO) {
        probeThickness = probeProfile.zThickness.autoZero;
    } else if (touchplateType === TOUCHPLATE_TYPE_ZERO) {
        probeThickness = probeProfile.zThickness.zProbe;
    } else if (touchplateType === TOUCHPLATE_TYPE_3D) {
        probeThickness = probeProfile.zThickness.probe3D;
    } else if (touchplateType === TOUCHPLATE_TYPE_BITZERO) {
        // Use Z-only thickness for tool change (probe placed flat on surface)
        probeThickness = probeProfile.zThickness.bitZeroZOnly;
    }

    return {
        slowSpeed: probeSettings.probeFeedrate,
        fastSpeed: probeSettings.probeFastFeedrate,
        retract: probeSettings.retractionDistance,
        zProbeDistance: probeSettings.zProbeDistance,
        zProbeThickness: probeThickness,
    };
};
