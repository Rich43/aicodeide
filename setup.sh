#!/usr/bin/env bash
set -e

OS="$(uname -s)"
case "$OS" in
    Linux*) ./setup_linux.sh ;;
    Darwin*) ./setup_mac.sh ;;
    MINGW*|MSYS*|CYGWIN*) pwsh ./setup_windows.ps1 ;;
    *) echo "Unsupported OS: $OS"; exit 1 ;;
esac
