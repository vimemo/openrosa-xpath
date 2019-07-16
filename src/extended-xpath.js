var shuffle = require('./shuffle');
var ns = require('./ns-extensions');
var processOperation = require('./process-operation');
var settings = require('./settings');

/*
 * From http://www.w3.org/TR/xpath/#section-Expressions XPath infix
 * operator precedence is left-associative, and as follows:
 */
var OP_PRECEDENCE = [
  ['|'],
  ['&'],
  ['=', '!='],
  ['<', '<=', '>=', '>'],
  ['+', '-'],
  ['*', '/', '%']
];

var DIGIT = /[0-9]/;
// TODO fix duplicate
var DATE_STRING = /^\d\d\d\d-\d{1,2}-\d{1,2}(?:T\d\d:\d\d:\d\d\.?\d?\d?(?:Z|[+-]\d\d:\d\d)|.*)?$/;
var FUNCTION_NAME = /^[a-z]/;
var NUMERIC_COMPARATOR = /(>|<)/;
var BOOLEAN_COMPARATOR = /(=)/;

var TOO_MANY_ARGS = new Error('too many args');
var TOO_FEW_ARGS = new Error('too few args');
var INVALID_ARGS = new Error('invalid args');

function dateToDays(d) {
  var temp = null;
  if(d.indexOf('T') > 0) {
    temp = new Date(d);
  } else {
    temp = d.split('-');
    temp = new Date(temp[0], temp[1]-1, temp[2]);
  }
  return (temp.getTime()) / (1000 * 60 * 60 * 24);
}

function checkMinMaxArgs(args, min, max) {
  if(min != null && args.length < min) throw TOO_FEW_ARGS;
  if(max != null && args.length > max) throw TOO_MANY_ARGS;
}

function checkNativeFn(name, args) {
  if(name === 'last') checkMinMaxArgs(args, null, 0);
  else if(name === 'boolean' || name === 'lang' ||
     name === 'ceiling' || name === 'name' || name === 'floor') {
    checkMinMaxArgs(args, 1, 1);
  }
  else if(name === 'number' || name === 'string' ||
    name === 'normalize-space' || name === 'string-length') {
    checkMinMaxArgs(args, null, 1);
  }
  else if(name === 'substring') checkMinMaxArgs(args, 2, 3);
  else if(name === 'starts-with' || name === 'contains' ||
    name === 'substring-after' || name === 'substring-before') {
    checkMinMaxArgs(args, 2, 2);
  }
  else if(name === 'translate') checkMinMaxArgs(args, 3, 3);
}


// TODO remove all the checks for cur.t==='?' - what else woudl it be?
var ExtendedXpathEvaluator = function(wrapped, extensions) {
  var
    extendedFuncs = extensions.func || {},
    extendedProcessors = extensions.process || {},
    toInternalResult = function(r) {
      var n, v;
      if(r.resultType === XPathResult.NUMBER_TYPE) return { t:'num', v:r.numberValue };
      if(r.resultType === XPathResult.BOOLEAN_TYPE) return {  t:'bool', v:r.booleanValue };
      if(r.resultType === XPathResult.UNORDERED_NODE_ITERATOR_TYPE) {
        v = [];
        while((n = r.iterateNext())) v.push(n.textContent);
        return { t:'arr', v:v };
      }
      return { t:'str', v:r.stringValue };
    },
    toExternalResult = function(r, rt) {
      if(extendedProcessors.toExternalResult) {
        var res = extendedProcessors.toExternalResult(r);
        if(res) return res;
      }

      if((r.t === 'arr' && rt === XPathResult.NUMBER_TYPE && DATE_STRING.test(r.v[0])) ||
          (r.t === 'str' && rt === XPathResult.NUMBER_TYPE && DATE_STRING.test(r.v))) {
        var val = r.t === 'arr' ? r.v[0] : r.v;
        var days = dateToDays(val);
        return {
          resultType:XPathResult.NUMBER_TYPE,
          numberValue:days,
          stringValue:days
        };
      }

      if(r.t === 'num') return { resultType:XPathResult.NUMBER_TYPE, numberValue:r.v, stringValue:r.v.toString() };
      if(r.t === 'bool')return { resultType:XPathResult.BOOLEAN_TYPE, booleanValue:r.v, stringValue:r.v.toString() };

      if(rt > 3) {
        r = shuffle(r[0], r[1]);
        return {
          snapshotLength: r.length,
          snapshotItem: function(idx) { return r[idx]; }
        };
      }

      if(!r.t && Array.isArray(r)) {
        if(rt === XPathResult.NUMBER_TYPE) {
          var v = parseInt(r[0].textContent);
          return { resultType:XPathResult.NUMBER_TYPE, numberValue:v, stringValue:v.toString() };
        } else if(rt === XPathResult.STRING_TYPE) {
          return { resultType:XPathResult.STRING_TYPE, stringValue: r.length ? r[0] : '' };
        }
      }

      return { resultType:XPathResult.STRING_TYPE, stringValue: r.v===null ? '' : r.v.toString() };
    },
    toNodes = function(r) {
      var n, v = [];
      while((n = r.iterateNext())) v.push(n);
      return v;
    },
    callFn = function(name, args, rt) {
      if(extendedFuncs.hasOwnProperty(name)) {
        // TODO can we pass rt all the time
        if(rt && (name.startsWith('date') || name === 'now' ||
          name === 'today' || name === 'randomize')) {
          args.push(rt);
        }
        return callExtended(name, args);
      }
      //TODO structure this better depending on how many more
      // native functions need to be patched
      if(name === 'number' && args.length) {
        if(args[0].t === 'arr') {
          args = [{t: 'num', v: args[0].v[0]}];
        } else if(args[0].t === 'str' && DATE_STRING.test(args[0].v)) {
          args = [{t: 'num', v: dateToDays(args[0].v)}];
        } else if(args[0].t === 'num' &&
          args[0].v.toString().indexOf('e-') > 0) {
          args = [{t: 'num', v: 0}];
        }
      }
      if(name === 'name' && args.length < 2) throw TOO_FEW_ARGS;
      if(name === 'namespace-uri') {
        if(args.length > 1) throw TOO_MANY_ARGS;
        if(args.length === 0) throw TOO_FEW_ARGS;
        if(args.length === 1 && !isNaN(args[0].v)) throw INVALID_ARGS;
      }
      if(name === 'local-name') {
        if(args.length > 1) throw TOO_MANY_ARGS;
        if(args.length === 1 && !isNaN(args[0].v)) throw INVALID_ARGS;
      }
      return callNative(name, args);
    },
    callExtended = function(name, args) {
      var argVals = [], res, i;
      for(i=0; i<args.length; ++i) argVals.push(args[i]);
      res = extendedFuncs[name].apply(null, argVals);
      return res;
    },
    callNative = function(name, args) {
      var argString = '', arg, quote, i;
      for(i=0; i<args.length; ++i) {
        arg = args[i];
        if(arg.t !== 'num' && arg.t !== 'bool') {
          quote = arg.v.indexOf('"') === -1 ? '"' : "'";
          argString += quote;
        }
        argString += arg.v;
        if(arg.t === 'bool') argString += '()';
        if(arg.t !== 'num' && arg.t !== 'bool') argString += quote;
        if(i < args.length - 1) argString += ', ';
      }
      checkNativeFn(name, args);
      return toInternalResult(wrapped(name + '(' + argString + ')'));
    },
    typefor = function(val) {
      if(extendedProcessors.typefor) {
        var res = extendedProcessors.typefor(val);
        if(res) return res;
      }
      if(typeof val === 'boolean') return 'bool';
      if(typeof val === 'number') return 'num';
      return 'str';
    };

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/evaluate
   */
  this.evaluate = function(input, cN, nR, rT, r) {
    if(rT === XPathResult.NUMBER_TYPE && input.indexOf('(') < 0 && !input.startsWith('/')) {
      input = input.replace('\n', ''); //replaces new lines of expressions without functions
      if(input.indexOf('mod')>0) { // to support 1mod1 or any weirdness
        input = input.replace('mod', ' mod ');
      }
      if(input.indexOf('div')>0) { // to support 1div1 or any weirdness
        input = input.replace('div', ' div ');
      }
    }

    if(input === 'string(namespace::node())') {
      input = input.replace('namespace::node()', 'namespace-uri(/*)');
    }

    if(/^(namespace::node\(\)|namespace::\*)$/.test(input)) {
      return ns.namespaceNode(cN);
    }

    if(/^namespace::/.test(input)) {
      return ns.namespace(input, cN);
    }

    if(/^local-name|namespace-uri|name\(|child::|parent::|descendant::|descendant-or-self::|ancestor::|ancestor-or-self::sibling|following::|following-sibling::|preceding-sibling::|preceding::|attribute::/.test(input)) {
      var args = input.substring(
        input.indexOf('(')+1,
        input.lastIndexOf(')')
      ).split(',');

      if(args.length > 1) { throw TOO_MANY_ARGS; }
      if(args.length < 1) { throw TOO_FEW_ARGS; }
      if(args[0].length && !isNaN(args[0])) { throw INVALID_ARGS; }

      return wrapped(input);
    }

    if((rT > 3 && !input.startsWith('randomize')) ||
      /^count\(|boolean\(/.test(input)) {

      if(input.startsWith('count(')) {
        if(input.indexOf(',') > 0) throw TOO_MANY_ARGS;
        if(input === 'count()') throw TOO_FEW_ARGS;
        if(!isNaN(/\((.*)\)/.exec(input)[1])) throw INVALID_ARGS;//firefox
      }
      if(input.startsWith('boolean(')) { //firefox
        if(input === 'boolean()') throw TOO_FEW_ARGS;
        var bargs = input.substring(8, input.indexOf(')')).split(',');
        if(bargs.length > 1) throw TOO_MANY_ARGS;
      }
      if(input === '/') cN = cN.ownerDocument || cN;
      return wrapped(input, cN, nR, rT, r);
    }

    if(rT === XPathResult.BOOLEAN_TYPE && input.indexOf('(') < 0 &&
        input.indexOf('/') < 0 && input.indexOf('=') < 0 &&
        input.indexOf('!=') < 0) {
      input = input.replace(/(\n|\r|\t)/g, '');
      input = input.replace(/"(\d)"/g, '$1');
      input = input.replace(/'(\d)'/g, '$1');
      input = "boolean-from-string("+input+")";
    }

    var i, cur, stack = [{ t:'root', tokens:[] }],
      peek = function() { return stack[stack.length-1]; },
      err = function(message) { throw new Error((message||'') + ' [stack=' + JSON.stringify(stack) + '] [cur=' + JSON.stringify(cur) + ']'); },
      newCurrent = function() { cur = { t:'?', v:'' }; },
      pushOp = function(t) {
        peek().tokens.push({ t:'op', v:t });
        newCurrent();
      },
      evalOp = function(lhs, op, rhs) {
        if(extendedProcessors.handleInfix) {
          var res = extendedProcessors.handleInfix(err, lhs, op, rhs);
          if(res && res.t === 'continue') {
            lhs = res.lhs; op = res.op; rhs = res.rhs; res = null;
          }

          if(typeof res !== 'undefined' && res !== null) return res;
        }
        return processOperation(lhs, op, rhs, settings);
      },
      evalOpAt = function(tokens, opIndex) {
        var res = evalOp(
            tokens[opIndex - 1],
            tokens[opIndex],
            tokens[opIndex + 1]);

        if(typeof res !== 'undefined' && res !== null) {
          tokens.splice(opIndex, 2);
          tokens[opIndex - 1] = { t:typefor(res), v:res };
        }
      },
      backtrack = function() {
        // handle infix operators
        var i, j, ops, tokens;
        tokens = peek().tokens;
        for(j=OP_PRECEDENCE.length-1; j>=0; --j) {
          ops = OP_PRECEDENCE[j];
          i = 1;
          while(i < tokens.length-1) {
            if(tokens[i].t === 'op' && ops.indexOf(tokens[i].v) !== -1) {
              evalOpAt(tokens, i);
            } else ++i;
          }
        }
      },
      handleXpathExpr = function() {
        var expr = cur.v;
        var evaluated;
        if(['position'].includes(peek().v)) {
          evaluated = wrapped(expr);
        } else {
          if(rT > 3 || (cur.v.indexOf('position()=') >= 0 &&
            stack.length === 1 && !/^[a-z]*[\(|\[]{1}/.test(cur.v))) {
            evaluated = toNodes(wrapped(expr));
          } else {
            if(expr.startsWith('$')) {
              evaluated = expr;
            } else {
              evaluated = toInternalResult(wrapped(expr));
            }
          }
        }
        peek().tokens.push(evaluated);
        newCurrent();
      },
      nextChar = function() {
        return input.charAt(i+1);
      },
      finaliseNum = function() {
        cur.v = parseFloat(cur.string);
        peek().tokens.push(cur);
        newCurrent();
      },
      prevToken = function() {
        var peeked = peek().tokens;
        return peeked[peeked.length - 1];
      },
      isNum = function(c) {
        return c >= '0' && c <= '9';
      };

    newCurrent();

    for(i=0; i<input.length; ++i) {
      var c = input.charAt(i);
      if(cur.sq) {
        cur.v += c;
        if(c === ']') --cur.sq;
        else if(c === '[') ++cur.sq;
        continue;
      }
      if(cur.t === 'str') {
        if(c === cur.quote) {
          peek().tokens.push(cur);
          newCurrent();
        } else cur.v += c;
        continue;
      }
      if(cur.t === 'num') {
        if(DIGIT.test(c) || ['e', '"', "'"].includes(c) ||
            (c === '-' && input[i-1] === 'e')) {
          cur.string += c;
          continue;
        } else if(c === '.' && !cur.decimal) {
          cur.decimal = 1;
          cur.string += c;
        } else finaliseNum();
      }
      if(isNum(c)) {
        if(cur.v === '') {
          cur = { t:'num', string:c };
        } else cur.v += c;
      } else switch(c) {
        case "'":
        case '"':
          if(cur.v === '') {
            cur = { t:'str', quote:c, v:'' };
          } else err('Not sure how to handle: ' + c);
          break;
        case '(':
          cur.t = 'fn';
          cur.tokens = [];
          stack.push(cur);
          if(cur.v === 'once') {
            newCurrent();
            cur.v = '.';
            handleXpathExpr();
          }
          newCurrent();

          break;
        case ')':
          if(nextChar() === '[') {
            // collapse the stack, and let the native evaluator handle this...
            var tail = stack.pop();
            tail.v = tail.v + '(' + cur.v + c;
            tail.t = '?';
            cur = tail;
            break;
          }

          if(cur.v !== '') handleXpathExpr();
          backtrack();
          cur = stack.pop();
          if(cur.t !== 'fn') err();
          if(cur.v) {
            var expectedReturnType = rT;
            if(rT === XPathResult.BOOLEAN_TYPE) {
              if(NUMERIC_COMPARATOR.test(input)) expectedReturnType = XPathResult.NUMBER_TYPE;
              if(BOOLEAN_COMPARATOR.test(input)) expectedReturnType = XPathResult.BOOLEAN_TYPE;
            }
            peek().tokens.push(callFn(cur.v, cur.tokens, expectedReturnType));
          } else {
            if(cur.tokens.length !== 1) err();
            peek().tokens.push(cur.tokens[0]);
          }
          newCurrent();
          break;
        case ',':
          if(cur.v !== '') handleXpathExpr();
          if(peek().t !== 'fn') err();
          break;
        case '*':
          if(c === '*' && (cur.v !== '' || peek().tokens.length === 0)) {
            cur.v += c;
            if(cur.v === './*') handleXpathExpr();
          } else if(cur.v === '' &&
            ([')', ''].includes(nextChar()) ||
            input.substring(i+1).trim() === ')')) {
            cur.v = c;
            handleXpathExpr();
          } else {
            pushOp(c);
          }
          break;
        case '-':
          var prev = prevToken();
          if(cur.v !== '' && nextChar() !== ' ' && input.charAt(i-1) !== ' ') {
            // function name expr
            cur.v += c;
          } else if((peek().tokens.length === 0 && cur.v === '') ||
            (prev && prev.t === 'op') ||
            // two argument function
            (prev && prev.t === 'num' && stack.length > 1 && stack[1].t === 'fn') ||
            // negative argument
            (prev && prev.t !== 'num' && isNum(nextChar()))) {
            // -ve number
            cur = { t:'num', string:'-' };
          } else {
            if(cur.v !== '') {
              peek().tokens.push(cur);
            }
            pushOp(c);
          }
          break;
        case '=':
          if(cur.v === '<' || cur.v === '&lt;' ||
              cur.v === '>' || cur.v === '&gt;' || cur.v === '!') {
            cur.v += c;
            switch(cur.v) {
              case '<=': case '&lt;=': pushOp('<='); break;
              case '>=': case '&gt;=': pushOp('>='); break;
              case '!=':               pushOp('!='); break;
            }
          } else {
            if(cur.v) handleXpathExpr();
            pushOp(c);
          }
          break;
        case ';':
          switch(cur.v) {
            case '&lt': cur.v = ''; c = '<'; break;
            case '&gt': cur.v = ''; c = '>'; break;
            default: cur.v += c; continue;
          }
          /* falls through */
        case '>':
        case '<':
          if(cur.v) handleXpathExpr();
          if(nextChar() === '=') {
            cur.v = c; break;
          }
          /* falls through */
        case '+':
          pushOp(c);
          break;
        case ' ':
          switch(cur.v) {
            case '': break; // trim leading whitespace
            case 'mod': pushOp('%'); break;
            case 'div': pushOp('/'); break;
            case 'and': pushOp('&'); break;
            case 'or':  pushOp('|'); break;
            default: {
              var op = cur.v.toLowerCase();
              if(/^(mod|div|and|or)$/.test(op)) throw INVALID_ARGS;
              if(!FUNCTION_NAME.test(cur.v)) handleXpathExpr();
            }
          }
          break;
        case '[':
          cur.sq = (cur.sq || 0) + 1;
          /* falls through */
        case '.':
          if(cur.v === '' && nextChar() === ')') {
            cur.v = c;
            handleXpathExpr();
            break;
          }
          if(cur.v === '' && isNum(nextChar())) {
            cur = { t:'num', string:c };
            break;
          }
          /* falls through */
        default:
          cur.v += c;
      }
    }
    if(cur.t === 'num') finaliseNum();
    if(cur.t === '?' && cur.v !== '') handleXpathExpr();
    if(cur.t !== '?' || cur.v !== '' || (cur.tokens && cur.tokens.length)) err('Current item not evaluated!');
    if(stack.length > 1) err('Stuff left on stack.');
    if(stack[0].t !== 'root') err('Weird stuff on stack.');
    if(stack[0].tokens.length === 0) err('No tokens.');
    if(stack[0].tokens.length >= 3) backtrack();
    if(stack[0].tokens.length > 1) err('Too many tokens.');
    return toExternalResult(stack[0].tokens[0], rT);
  };
};

var XPathException = function(code, message) {
  var err;
  this.code = code;
  switch(this.code) {
    case XPathException.INVALID_EXPRESSION_ERR:
      this.name = 'INVALID_EXPRESSION_ERR';
      break;
    case XPathException.TYPE_ERR:
      this.name = 'TYPE_ERR';
      break;
    default:
      err = new Error('Unsupported XPathException code: ' + this.code);
      err.name = 'XPathExceptionInternalError';
      throw err;
  }
  this.message = (message || '');
};

XPathException.prototype.toString = function() {
  return 'XPathException: "' + this.message + '"' +
    ', code: "' + this.code + '"' +
    ', name: "' + this.name + '"'
  ;
};

XPathException.INVALID_EXPRESSION_ERR = 51;
XPathException.TYPE_ERR = 52;

// if(typeof define === 'function') {
//   define(function() { return ExtendedXpathEvaluator; });
// } else if(typeof module === 'object' && typeof module.exports === 'object') {
  module.exports = ExtendedXpathEvaluator;
// }
