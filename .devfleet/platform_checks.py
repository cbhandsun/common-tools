#!/usr/bin/env python3
"""Project-specific gates that need native platform or source SHA selection."""
import argparse
import os
from pathlib import Path
import platform
import subprocess
import sys


def commands(mode, root, node, npm, system):
    run = [node, npm, 'run']
    if mode == 'sbom':
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
        return [run + ['common-tools:sbom', '--', '--output', 'artifacts/common-tools.spdx.json'],
                run + ['common-tools:release-evidence', '--', '--sbom', 'artifacts/common-tools.spdx.json', '--output', 'artifacts/common-tools.release.json', '--revision', revision],
                run + ['common-tools:verify-release-evidence', '--', '--sbom', 'artifacts/common-tools.spdx.json', '--manifest', 'artifacts/common-tools.release.json', '--revision', revision]]
    if mode == 'linux-recovery':
        if system != 'Linux':
            return []
        return [run + [name] for name in ['test:linux-process-recovery', 'test:container-recovery', 'test:postgres-recovery', 'test:s3-retention']]
    if system != 'Linux':
        return []
    return [['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
             '--mount', 'type=bind,source=' + str(root / '.github/workflows') + ',target=/work,readonly',
             '--mount', 'type=bind,source=' + str(root / '.github/actionlint.yaml') + ',target=/actionlint.yaml,readonly',
             'rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667',
             '-config-file', '/actionlint.yaml', '/work/ci.yml', '/work/release.yml', '/work/ppt-office-regression.yml']]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['sbom', 'linux-recovery', 'workflow-lint'])
    parser.add_argument('--node', required=True)
    parser.add_argument('--npm-cli', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    tasks = commands(args.mode, root, args.node, args.npm_cli, platform.system())
    if not tasks:
        print('DEVFOUNDRY_NOT_APPLICABLE=' + args.mode + '; Linux-only gate')
        return 0
    result = 0
    for command in tasks:
        code = subprocess.run(command, cwd=root, shell=False).returncode
        result = result or code
    return result


if __name__ == '__main__':
    sys.exit(main())
