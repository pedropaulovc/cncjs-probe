"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WRITE_SOURCE_SERVER = exports.WRITE_SOURCE_SENDER = exports.WRITE_SOURCE_FEEDER = exports.WRITE_SOURCE_CLIENT = exports.TOOL_CHANGE_POLICY_SEND_M6_COMMANDS = exports.TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_WCS = exports.TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_TLO = exports.TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_CUSTOM_PROBING = exports.TOOL_CHANGE_POLICY_IGNORE_M6_COMMANDS = exports.METRIC_UNITS = exports.IMPERIAL_UNITS = exports.GLOBAL_OBJECTS = exports.BUILTIN_COMMAND_WAIT = exports.BUILTIN_COMMAND_MSG = void 0;
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
var GLOBAL_OBJECTS = exports.GLOBAL_OBJECTS = {
  // Function properties
  parseFloat: parseFloat,
  parseInt: parseInt,
  // Fundamental objects
  Object: Object,
  Function: Function,
  Boolean: Boolean,
  // Numbers and dates
  Number: Number,
  Math: Math,
  Date: Date,
  // Text processing
  String: String,
  RegExp: RegExp,
  // Structured data
  JSON: JSON
};

// Builtin Commands
var BUILTIN_COMMAND_MSG = exports.BUILTIN_COMMAND_MSG = '%msg';
var BUILTIN_COMMAND_WAIT = exports.BUILTIN_COMMAND_WAIT = '%wait';

// M6 Tool Change
var TOOL_CHANGE_POLICY_IGNORE_M6_COMMANDS = exports.TOOL_CHANGE_POLICY_IGNORE_M6_COMMANDS = 0;
var TOOL_CHANGE_POLICY_SEND_M6_COMMANDS = exports.TOOL_CHANGE_POLICY_SEND_M6_COMMANDS = 1;
var TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_WCS = exports.TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_WCS = 2;
var TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_TLO = exports.TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_TLO = 3;
var TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_CUSTOM_PROBING = exports.TOOL_CHANGE_POLICY_MANUAL_TOOL_CHANGE_CUSTOM_PROBING = 4;

// Units
var IMPERIAL_UNITS = exports.IMPERIAL_UNITS = 'in';
var METRIC_UNITS = exports.METRIC_UNITS = 'mm';

// Write Source
var WRITE_SOURCE_CLIENT = exports.WRITE_SOURCE_CLIENT = 'client';
var WRITE_SOURCE_SERVER = exports.WRITE_SOURCE_SERVER = 'server';
var WRITE_SOURCE_FEEDER = exports.WRITE_SOURCE_FEEDER = 'feeder';
var WRITE_SOURCE_SENDER = exports.WRITE_SOURCE_SENDER = 'sender';