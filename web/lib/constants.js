/*
 * Ported from gSender:
 *   src/app/src/lib/constants.ts (touch plate and probe types)
 *   src/app/src/constants/index.ts (units, firmware and state names used by the Probe tool)
 * https://github.com/Sienci-Labs/gsender/tree/e73082afb83ee2377ed2077537c45fec33efaba0/src/app/src
 * Copyright (C) 2021 Sienci Labs Inc.
 *
 * This file is part of cncjs-probe and, like gSender, is free software: you
 * can redistribute it and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software Foundation, under version
 * 3 of the License. It is distributed WITHOUT ANY WARRANTY; see LICENSE.
 *
 * Modified: ported to JS (browser ES module); only the constants the Probe
 * tool uses are kept, and the two upstream files are merged into one.
 */

// src/app/src/lib/constants.ts
export const TOUCHPLATE_TYPE_STANDARD = 'Standard Block';
export const TOUCHPLATE_TYPE_AUTOZERO = 'AutoZero';
export const TOUCHPLATE_TYPE_ZERO = 'Z Probe';
export const TOUCHPLATE_TYPE_3D = '3D Probe';
export const TOUCHPLATE_TYPE_BITZERO = 'BitZero';

export const PROBE_TYPE_AUTO = 'Auto';
export const PROBE_TYPE_TIP = 'Tip';
export const PROBE_TYPE_DIAMETER = 'Diameter';

// src/app/src/constants/index.ts
export const IMPERIAL_UNITS = 'in';
export const METRIC_UNITS = 'mm';
export const GRBL = 'Grbl';
export const GRBLHAL = 'grblHAL';
export const WORKFLOW_STATE_RUNNING = 'running';
export const GRBL_ACTIVE_STATE_IDLE = 'Idle';
