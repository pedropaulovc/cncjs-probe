"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.match = void 0;
var _ensureType = require("ensure-type");
var _constants = require("../constants");
var match = exports.match = function match(line) {
  // Strip anything after a semi-colon to the end of the line
  var strippedLine = (0, _ensureType.ensureString)(line).replace(/;.*$/, '').trim();
  var cmds = [_constants.BUILTIN_COMMAND_MSG, _constants.BUILTIN_COMMAND_WAIT];
  var re = new RegExp("^(".concat(cmds.join('|'), ")\\b"), 'i');
  var match = strippedLine.match(re);
  if (!match) {
    return null;
  }
  var command = (0, _ensureType.ensureString)(match[1]).toLowerCase();
  var rest = strippedLine.slice(match[0].length).trim();
  return [command, rest];
};