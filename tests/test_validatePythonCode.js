const assert = require('assert');
const { validatePythonCode } = require('../server/validatePythonCode');

(async () => {
  // Valid Python code should yield no errors
  const validCode = "def add(a, b):\n    return a + b\n";
  const errorsValid = await validatePythonCode(validCode, null);
  assert.strictEqual(errorsValid.length, 0, 'Expected no errors for valid Python');

  // Code with syntax error should report a syntax error
  const syntaxErrorCode = "def bad(:\n    pass\n";
  const errorsSyntax = await validatePythonCode(syntaxErrorCode, null);
  assert(errorsSyntax.some(e => e.startsWith('Syntax Error')), 'Expected syntax error');

  // Code with PEP8 violations but valid syntax
  const pep8Code = "def add(a,b):\n  return a+b\n";
  const errorsPep8 = await validatePythonCode(pep8Code, null);
  assert(errorsPep8.some(e => e.startsWith('PEP8 Violations')), 'Expected PEP8 violations');

  console.log('All tests passed');
})().catch(err => { console.error(err); process.exit(1); });
