// What CNCjs 1.11.5 needs that gSender's server provides.
//
// gSender's server converts the macro positions posx/posy/posz to mm when Grbl
// reports in inches ($13=1); CNCjs passes them in report units. Routines that
// capture a position and use it under G21 (BitZero's bore centring, the tool
// length wizard's saved position and TOOL_OFFSET) would then mix inches into mm
// moves, so their position reads are scaled to mm here. The AutoZero routines
// are left alone: they prefix G20 to the moves that use captured positions when
// $13=1, which is right for CNCjs's inch positions.

const POSITION = /\bpos([xyz])\b/g;

// -> the lines with every posx/posy/posz read in a `%` assignment scaled to mm
// when the controller reports inches; otherwise the lines unchanged.
export const positionsInMm = (lines, $13) => {
    if ($13 !== '1') return lines;
    return lines.map((line) => (typeof line === 'string' && line.startsWith('%') ? line.replace(POSITION, '(pos$1 * 25.4)') : line));
};
