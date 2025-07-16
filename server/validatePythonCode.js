const { spawn } = require('child_process');

async function validatePythonCode(code, ws, logger = () => {}) {
    let errors = [];
    try {
        // Syntax validation using Python AST
        const pyCompile = spawn('python', ['-c', 'import sys,ast; ast.parse(sys.stdin.read())']);
        pyCompile.stdin.write(code);
        pyCompile.stdin.end();

        const stderrPyCompile = await new Promise(resolve => {
            let err = '';
            pyCompile.stderr.on('data', data => { err += data.toString(); });
            pyCompile.on('close', () => resolve(err));
        });

        if (stderrPyCompile.trim()) {
            errors.push(`Syntax Error: ${stderrPyCompile.trim()}`);
        }

        // PEP8 validation using pycodestyle
        const pycodestyle = spawn('pycodestyle', ['-']);
        pycodestyle.stdin.write(code);
        pycodestyle.stdin.end();

        const stdoutPycodestyle = await new Promise(resolve => {
            let out = '';
            pycodestyle.stdout.on('data', data => { out += data.toString(); });
            pycodestyle.on('close', () => resolve(out));
        });

        if (stdoutPycodestyle.trim()) {
            errors.push(`PEP8 Violations:\n${stdoutPycodestyle.trim()}`);
        }
    } catch (e) {
        logger(ws, `Python validation tool error: ${e.message}. Make sure 'python' and 'pycodestyle' are installed and in PATH.`);
        errors.push(`Internal validator error: ${e.message}`);
    }
    return errors;
}

module.exports = { validatePythonCode };
