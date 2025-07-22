# Agent Guidelines

The following guidelines apply to the entire repository.

## Coding Style
- Use **2 spaces** for indentation in JavaScript/Node.js code.
- Use **4 spaces** for indentation in Python.
- Prefer `const`/`let` over `var` in JavaScript.
- Include semicolons at the end of statements.
- Keep functions small and focused; aim for readability.

## Commit Messages
- Use short, descriptive commit messages written in the imperative mood.
- Explain *why* a change is made when it is not obvious.

## Pull Request Message
Include two sections:
1. **Summary** – Describe the key changes.
2. **Testing** – Report the commands run and their results. If tests fail due to environment limitations, mention that explicitly.

## Testing Instructions
- Install dependencies in the `server` directory with `npm install`.
- Run tests from `server` with `npm test`.
- If Python code is modified, ensure `pycodestyle` passes (`python3 -m pycodestyle <file>`).

