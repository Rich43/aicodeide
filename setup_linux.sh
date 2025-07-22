#!/usr/bin/env bash
set -e

# Ensure Python 3.11+
if ! command -v python3 >/dev/null; then
    echo "Python3 not found. Please install Python 3.11+" >&2
    exit 1
fi

PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
if [ "$(printf '%s\n' '3.11' "$PY_VERSION" | sort -V | head -n1)" != "3.11" ]; then
    echo "Python 3.11+ required. Current: $PY_VERSION" >&2
    exit 1
fi

# Install Poetry if missing
if ! command -v poetry >/dev/null; then
    curl -sSL https://install.python-poetry.org | python3 -
    export PATH="$HOME/.local/bin:$PATH"
fi

# Install dependencies if pyproject exists
if [ -f pyproject.toml ]; then
    poetry install
fi
