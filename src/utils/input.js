function isOperation(input, rT) {
  return rT === XPathResult.NUMBER_TYPE && // expects a number result
    input.indexOf('(') < 0 // not a function based expression
    && !input.startsWith('/'); // not a path expression
}

function preprocessInput(input, rT) {
  if(isOperation(input, rT)) {
    input = input.replace('\n', ''); //replaces new lines for expressions without functions
    if(input.indexOf('mod') > 0) { // to support 1mod1 or any weirdness
      input = input.replace('mod', ' mod ');
    }
    if(input.indexOf('div') > 0) { // to support 1div1 or any weirdness
      input = input.replace('div', ' div ');
    }
  }

  if(input === 'string(namespace::node())') {
    input = input.replace('namespace::node()', 'namespace-uri(/*)');
  }
  return input;
}

module.exports = {
  preprocessInput
}
