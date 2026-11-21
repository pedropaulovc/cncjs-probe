"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _set2 = _interopRequireDefault(require("lodash/set"));
var _esprima = require("esprima");
var _evaluateExpression = _interopRequireDefault(require("./evaluate-expression"));
var _logger = _interopRequireDefault(require("./logger"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
var log = (0, _logger["default"])('evaluate-assignment-expression');
var isStaticMemberExpression = function isStaticMemberExpression(node) {
  return _typeof(node) === 'object' && node.type === 'MemberExpression' && !node.computed;
};
var isComputedMemberExpression = function isComputedMemberExpression(node) {
  return _typeof(node) === 'object' && node.type === 'MemberExpression' && !!node.computed;
};
var _lookupObjectPath = function lookupObjectPath(node, vars) {
  if (!node) {
    return [];
  }

  /*
     * Expression: 'x = value'
     *
     * Identifier { type: 'Identifier', name: 'x' }
     */
  if (node.type === 'Identifier') {
    return [node.name];
  }
  if (isComputedMemberExpression(node)) {
    return [].concat(_toConsumableArray(_lookupObjectPath(node.object, vars)), [(0, _evaluateExpression["default"])(node.property, vars)]);
  }
  if (isStaticMemberExpression(node)) {
    /*
         * Expression: 'x.y = value'
         *
         * StaticMemberExpression {
         *   type: 'MemberExpression',
         *   computed: false,
         *   object: Identifier { type: 'Identifier', name: 'x' },
         *   property: Identifier { type: 'Identifier', name: 'y' }
         * }
         *
         * Expression: 'x[y] = value'
         *
         * ComputedMemberExpression {
         *   type: 'MemberExpression',
         *   computed: true,
         *   object: Identifier { type: 'Identifier', name: 'x' },
         *   property: Identifier { type: 'Identifier', name: 'y' }
         * }
         */
    if (node.property.type === 'Identifier') {
      return [].concat(_toConsumableArray(_lookupObjectPath(node.object, vars)), [node.property.name]);
    }

    /*
         * Expression: 'x["y"] = value'
         *
         * ComputedMemberExpression {
         *   type: 'MemberExpression',
         *   computed: true,
         *   object: Identifier { type: 'Identifier', name: 'x' },
         *   property: Literal { type: 'Literal', value: 'y', raw: '"y"' }
         * }
         */
    if (node.property.type === 'Literal') {
      return [].concat(_toConsumableArray(_lookupObjectPath(node.object, vars)), [node.property.value]);
    }
    return [].concat(_toConsumableArray(_lookupObjectPath(node.object, vars)), [(0, _evaluateExpression["default"])(node.property, vars)]);
  }
  return [node.name];
};
var walkAssignmentExpression = function walkAssignmentExpression(node, vars) {
  console.assert(node && node.type === 'AssignmentExpression');
  var path = _lookupObjectPath(node.left, vars);
  if (path) {
    var value = (0, _evaluateExpression["default"])(node.right, vars);
    (0, _set2["default"])(vars, path, value);
  }
};
var walkSequenceExpression = function walkSequenceExpression(node, vars) {
  console.assert(node && node.type === 'SequenceExpression');
  node.expressions.forEach(function (expr) {
    if (expr.type === 'AssignmentExpression') {
      walkAssignmentExpression(expr, vars);
      return;
    }
    (0, _evaluateExpression["default"])(expr, vars);
  });
};
var evaluateAssignmentExpression = function evaluateAssignmentExpression(src) {
  var vars = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  if (!src) {
    return vars;
  }
  try {
    var ast = (0, _esprima.parse)(src).body[0].expression;
    if (ast.type === 'AssignmentExpression') {
      walkAssignmentExpression(ast, vars);
    } else if (ast.type === 'SequenceExpression') {
      walkSequenceExpression(ast, vars);
    } else {
      (0, _evaluateExpression["default"])(ast, vars);
    }
  } catch (e) {
    log.error("src=\"".concat(src, "\", vars=").concat(JSON.stringify(vars)));
    log.error(e);
  }
  return vars;
};
var _default = exports["default"] = evaluateAssignmentExpression;