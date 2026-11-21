/*
 * Ported from gSender: src/app/src/lib/units.ts
 * https://github.com/Sienci-Labs/gsender/blob/e73082afb83ee2377ed2077537c45fec33efaba0/src/app/src/lib/units.ts
 * Copyright (C) 2021 Sienci Labs Inc.
 *
 * This file is part of cncjs-probe and, like gSender, is free software: you
 * can redistribute it and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software Foundation, under version
 * 3 of the License. It is distributed WITHOUT ANY WARRANTY; see LICENSE.
 *
 * Modified: ported to JS (browser ES module); only the conversions the Probe
 * tool uses are kept (the display formatters read gSender's settings store).
 */

const CALC_UNIT = 25.4;

// Converts value from millimeters to inches
export const mm2in = (val = 0) => val / 25.4;

// Converts values from inches to millimeters
export const in2mm = (val = 0) => val * 25.4;

export const convertToImperial = (val) => {
    return Number((val / CALC_UNIT).toFixed(3));
};

export const convertToMetric = (val) => {
    return Number((val * CALC_UNIT).toFixed(2));
};
