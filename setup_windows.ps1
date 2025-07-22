$ErrorActionPreference = 'Stop'

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error 'Python 3.11+ required. Please install it.'
    exit 1
}

$version = python - <<'PY'
import sys
print(f'{sys.version_info.major}.{sys.version_info.minor}')
PY

if ([version]$version -lt [version]'3.11') {
    Write-Error "Python 3.11+ required. Current: $version"
    exit 1
}

if (-not (Get-Command poetry -ErrorAction SilentlyContinue)) {
    (Invoke-WebRequest -Uri 'https://install.python-poetry.org' -UseBasicParsing).Content | python -
    $env:PATH += ';'+(Join-Path $env:USERPROFILE '.local\bin')
}

if (Test-Path 'pyproject.toml') {
    poetry install
}
