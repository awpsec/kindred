#!/usr/bin/env python3
"""Regenerate the iOS light/dark/tinted icon and loading/welcome artwork.

Requires Python 3 and librsvg. Geometry is shared with desktop and web exports.
"""
from pathlib import Path
import subprocess
import sys

if __name__ == '__main__':
    root = Path(__file__).resolve().parents[3]
    subprocess.run([sys.executable, str(root / 'branding/generate.py'), '--target', 'ios'], check=True)
