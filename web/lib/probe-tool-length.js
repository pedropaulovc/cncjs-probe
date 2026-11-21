/*
 * Ported from gSender: src/app/src/wizards/probeToolLength.tsx
 * https://github.com/Sienci-Labs/gsender/blob/e73082afb83ee2377ed2077537c45fec33efaba0/src/app/src/wizards/probeToolLength.tsx
 * Copyright (C) 2026 Sienci Labs Inc.
 *
 * This file is part of cncjs-probe and, like gSender, is free software: you
 * can redistribute it and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software Foundation, under version
 * 3 of the License. It is distributed WITHOUT ANY WARRANTY; see LICENSE.
 *
 * Modified: ported to JS (browser ES module). Upstream reads the controller,
 * the probe settings (getProbeSettings) and the fixed sensor location
 * (workspace.toolChangePosition) from gSender globals; here createWizard and
 * calculateMaxZProbeDistance take them as arguments, and $132 comes from
 * ./machine-store.js (filled from CNCjs). The safe height is an argument too:
 * upstream picks '-0.5' when $13=1 and '-10' otherwise, but every move to it
 * runs under G21, so with $13=1 it means -0.5 mm machine Z, inside the homing
 * pull-off of the Z switch on Grbl. The widget passes a machine Z in mm from
 * its settings instead. The rest of the G-code is unchanged.
 */
import * as reduxStore from './machine-store.js';

// $132 is max z travel, if soft limits ($20) enabled we need to make sure probe distance will not exceed max limits
export const calculateMaxZProbeDistance = (_zProbeDistance = 30, position) => {
    const state = reduxStore.getState();
    const maxZTravel = Number(reduxStore.get(state, 'controller.settings.settings.$132'));

    const curZPos = Math.abs(position.z);

    return (maxZTravel - curZPos - 2).toFixed(3);
};

// controller: { command(cmd, lines) }; settings: getProbeSettings() result;
// position: the fixed sensor location in machine coordinates (mm);
// zSafe: the machine Z (mm) to travel at, as a string.
const createWizard = ({ controller, settings, position, zSafe }) => {
    return {
        intro: {
            icon: 'fas fa-ruler-vertical',
            description:
                'Prepare to probe the initial tool length. Ensure your router/spindle is turned off and has fully stopped spinning.',
        },
        onStart: () => {
            const zProbeDistance = calculateMaxZProbeDistance(
                settings.zProbeDistance,
                position,
            );

            controller.command('gcode', [
                '%wait',
                `%global.toolchange.PROBE_THICKNESS_MM=${settings.zProbeThickness}`,
                `%global.toolchange.PROBE_DISTANCE=${zProbeDistance}`,
                `%global.toolchange.PROBE_FEEDRATE=${settings.fastSpeed}`,
                `%global.toolchange.PROBE_SLOW_FEEDRATE=${settings.slowSpeed}`,
                `%global.toolchange.RETRACT=${settings.retract}`,
                `%global.toolchange.PROBE_POS_X=${position.x}`,
                `%global.toolchange.PROBE_POS_Y=${position.y}`,
                `%global.toolchange.PROBE_POS_Z=${position.z}`,
                `%global.toolchange.Z_SAFE_HEIGHT=${zSafe}`,
                '%global.toolchange.UNITS=modal.units',
                '%global.toolchange.SPINDLE=modal.spindle',
                '%global.toolchange.DISTANCE=modal.distance',
                '%global.toolchange.FEEDRATE=programFeedrate',
                '%global.toolchange.SPINDLE_RATE=spindleRate',
                '(STORED: [global.toolchange.SPINDLE] S[global.toolchange.SPINDLE_RATE])',
                'M5 S0',
                '%wait',
                '%global.toolchange.XPOS=posx',
                '%global.toolchange.YPOS=posy',
                '%global.toolchange.ZPOS=posz',
                'G91 G21',
                'G53 G0 Z[global.toolchange.Z_SAFE_HEIGHT]',
                '(Tool probe initiated)',
            ]);
        },
        steps: [
            {
                title: 'Probe Initial Tool',
                substeps: [
                    {
                        title: 'Measure Tool Length',
                        description:
                            'Ensure that your router/spindle is turned off and has fully stopped spinning. Click the button below to probe the length of the current tool.',
                        overlay: false,
                        actions: [
                            {
                                label: 'Probe Tool Length',
                                gcodeLines: [
                                    'G91 G21',
                                    'G53 G0 Z[global.toolchange.Z_SAFE_HEIGHT]',
                                    'G53 G0 X[global.toolchange.PROBE_POS_X] Y[global.toolchange.PROBE_POS_Y]',
                                    'G53 G0 Z[global.toolchange.PROBE_POS_Z]',
                                    'G38.2 Z-[global.toolchange.PROBE_DISTANCE] F[global.toolchange.PROBE_FEEDRATE]',
                                    'G0 Z[global.toolchange.RETRACT]',
                                    'G38.2 Z-10 F[global.toolchange.PROBE_SLOW_FEEDRATE]',
                                    'G4 P0.3',
                                    '%global.toolchange.TOOL_OFFSET=posz',
                                    '(TLO set: [global.toolchange.TOOL_OFFSET])',
                                    'G0 Z[global.toolchange.RETRACT]',
                                    'G90 G21',
                                    'G53 G0 Z[global.toolchange.Z_SAFE_HEIGHT]',
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                title: 'Resume',
                substeps: [
                    {
                        title: 'Resume Operation',
                        description:
                            'Tool length has been probed and set. Click the button below to continue with your operation. Turn on your router if you have one.',
                        overlay: false,
                        actions: [
                            {
                                label: 'Resume',
                                gcodeLines: [
                                    '(Restart Spindle)',
                                    '([global.toolchange.SPINDLE] S[global.toolchange.SPINDLE_RATE])',
                                    '[global.toolchange.SPINDLE] S[global.toolchange.SPINDLE_RATE]',
                                    '(Returning to initial position)',
                                    'G53 G0 Z[global.toolchange.Z_SAFE_HEIGHT]',
                                    'G90 G0 X[global.toolchange.XPOS] Y[global.toolchange.YPOS]',
                                    'G90 G0 Z[global.toolchange.ZPOS]',
                                    '(Restore initial modals)',
                                    '[global.toolchange.UNITS] [global.toolchange.DISTANCE] [global.toolchange.FEEDRATE]',
                                    '%wait',
                                    '%toolchange_complete',
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
};

export default createWizard;
