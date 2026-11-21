"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _escodegen = require("escodegen");
var _esprima = require("esprima");
var _logger = _interopRequireDefault(require("./logger"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); } /* eslint no-bitwise: 0 */
var log = (0, _logger["default"])('evaluate-expression');
var UNRESOLVED = Symbol('unresolved');
var evaluateExpression = function evaluateExpression(src, vars) {
  if (!vars || _typeof(vars) !== 'object') {
    vars = _objectSpread({}, vars);
  }
  var _walk = function walk(node) {
    if (node.type === 'Literal') {
      return node.value;
    }
    if (node.type === 'UnaryExpression') {
      var val = _walk(node.argument);
      if (node.operator === '+') {
        return +val;
      }
      if (node.operator === '-') {
        return -val;
      }
      if (node.operator === '~') {
        return ~val;
      }
      if (node.operator === '!') {
        return !val;
      }
      return UNRESOLVED;
    }
    if (node.type === 'ArrayExpression') {
      var xs = [];
      for (var i = 0, l = node.elements.length; i < l; i++) {
        var x = _walk(node.elements[i]);
        if (x === UNRESOLVED) {
          return UNRESOLVED;
        }
        xs.push(x);
      }
      return xs;
    }
    if (node.type === 'ObjectExpression') {
      var obj = {};
      for (var _i = 0; _i < node.properties.length; _i++) {
        var prop = node.properties[_i];
        var value = prop.value === null ? prop.value : _walk(prop.value);
        if (value === UNRESOLVED) {
          return UNRESOLVED;
        }
        obj[prop.key.value || prop.key.name] = value;
      }
      return obj;
    }
    if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
      var _l = _walk(node.left);
      if (_l === UNRESOLVED) {
        return UNRESOLVED;
      }
      var r = _walk(node.right);
      if (r === UNRESOLVED) {
        return UNRESOLVED;
      }
      var op = node.operator;
      if (op === '==') {
        return _l == r; // eslint-disable-line eqeqeq
      }
      if (op === '===') {
        return _l === r;
      }
      if (op === '!=') {
        return _l != r; // eslint-disable-line eqeqeq
      }
      if (op === '!==') {
        return _l !== r;
      }
      if (op === '+') {
        return _l + r;
      }
      if (op === '-') {
        return _l - r;
      }
      if (op === '*') {
        return _l * r;
      }
      if (op === '/') {
        return _l / r;
      }
      if (op === '%') {
        return _l % r;
      }
      if (op === '<') {
        return _l < r;
      }
      if (op === '<=') {
        return _l <= r;
      }
      if (op === '>') {
        return _l > r;
      }
      if (op === '>=') {
        return _l >= r;
      }
      if (op === '|') {
        return _l | r;
      }
      if (op === '&') {
        return _l & r;
      }
      if (op === '^') {
        return _l ^ r;
      }
      if (op === '&&') {
        return _l && r;
      }
      if (op === '||') {
        return _l || r;
      }
      return UNRESOLVED;
    }
    if (node.type === 'Identifier') {
      if (Object.hasOwnProperty.call(vars, node.name)) {
        return vars[node.name];
      }
      return UNRESOLVED;
    }
    if (node.type === 'ThisExpression') {
      if (Object.hasOwnProperty.call(vars, 'this')) {
        return vars['this']; // eslint-disable-line dot-notation
      }
      return UNRESOLVED;
    }
    if (node.type === 'CallExpression') {
      var callee = _walk(node.callee);
      if (callee === UNRESOLVED) {
        return UNRESOLVED;
      }
      if (typeof callee !== 'function') {
        return UNRESOLVED;
      }
      var ctx = node.callee.object ? _walk(node.callee.object) : UNRESOLVED;
      if (ctx === UNRESOLVED) {
        ctx = null;
      }
      var args = [];
      for (var _i2 = 0, _l2 = node.arguments.length; _i2 < _l2; _i2++) {
        var _x = _walk(node.arguments[_i2]);
        if (_x === UNRESOLVED) {
          return UNRESOLVED;
        }
        args.push(_x);
      }
      return callee.apply(ctx, args);
    }
    if (node.type === 'MemberExpression') {
      var _obj = _walk(node.object);
      if (_obj === UNRESOLVED) {
        return UNRESOLVED;
      }
      if (node.property.type === 'Identifier') {
        return _obj[node.property.name];
      }
      var _prop = _walk(node.property);
      if (_prop === UNRESOLVED) {
        return UNRESOLVED;
      }
      return _obj[_prop];
    }
    if (node.type === 'ConditionalExpression') {
      var _val = _walk(node.test);
      if (_val === UNRESOLVED) {
        return UNRESOLVED;
      }
      return _val ? _walk(node.consequent) : _walk(node.alternate);
    }
    if (node.type === 'ExpressionStatement') {
      var _val2 = _walk(node.expression);
      if (_val2 === UNRESOLVED) {
        return UNRESOLVED;
      }
      return _val2;
    }
    if (node.type === 'ReturnStatement') {
      return _walk(node.argument);
    }
    if (node.type === 'FunctionExpression') {
      var bodies = node.body.body;

      // Create a "scope" for our arguments
      var oldVars = {};
      Object.keys(vars).forEach(function (element) {
        oldVars[element] = vars[element];
      });
      for (var _i3 = 0; _i3 < node.params.length; _i3++) {
        var key = node.params[_i3];
        if (key.type !== 'Identifier') {
          return UNRESOLVED;
        }
        vars[key.name] = null;
      }
      for (var _i4 in bodies) {
        if (_walk(bodies[_i4]) === UNRESOLVED) {
          return UNRESOLVED;
        }
      }

      // restore the vars and scope after walk
      vars = oldVars;
      var keys = Object.keys(vars);
      var vals = keys.map(function (key) {
        return vars[key];
      });
      return Function(keys.join(', '), 'return ' + (0, _escodegen.generate)(node)).apply(null, vals); // eslint-disable-line no-new-func
    }
    if (node.type === 'TemplateLiteral') {
      var str = '';
      var _i5 = 0;
      for (_i5 = 0; _i5 < node.expressions.length; _i5++) {
        str += _walk(node.quasis[_i5]);
        str += _walk(node.expressions[_i5]);
      }
      str += _walk(node.quasis[_i5]);
      return str;
    }
    if (node.type === 'TaggedTemplateExpression') {
      var tag = _walk(node.tag);
      var quasi = node.quasi;
      var strings = quasi.quasis.map(_walk);
      var values = quasi.expressions.map(_walk);
      return tag.apply(null, [strings].concat(values));
    }
    if (node.type === 'TemplateElement') {
      return node.value.cooked;
    }
    return UNRESOLVED;
  };
  var result = UNRESOLVED;
  try {
    var ast;
    if (typeof src === 'string') {
      ast = (0, _esprima.parse)(src).body[0].expression;
    } else {
      ast = src;
    }
    result = _walk(ast);
  } catch (e) {
    log.error("src=\"".concat(src, "\", vars=").concat(JSON.stringify(vars)));
    log.error(e);
  }
  return result === UNRESOLVED ? undefined : result;
};
var _default = exports["default"] = evaluateExpression;