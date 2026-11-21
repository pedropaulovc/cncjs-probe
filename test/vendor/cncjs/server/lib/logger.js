"use strict";

// Test stand-in for CNCjs's winston logger (server/lib/logger.js): the vendored
// evaluators only call log.error/warn/debug. Errors are kept so tests can
// assert that no expression failed to evaluate.
Object.defineProperty(exports, "__esModule", { value: true });
exports["default"] = void 0;
var errors = [];
exports.errors = errors;
var logger = function logger(namespace) {
  return {
    error: function error() { errors.push([namespace].concat(Array.prototype.slice.call(arguments))); },
    warn: function warn() {},
    info: function info() {},
    verbose: function verbose() {},
    debug: function debug() {},
    silly: function silly() {}
  };
};
exports["default"] = logger;
