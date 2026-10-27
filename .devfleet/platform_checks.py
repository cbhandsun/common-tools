#!/usr/bin/env python3
"""Project-specific gates that need native platform or source SHA selection."""
import argparse
import os
from pathlib import Path
import platform
import subprocess
import sys
import json
import time


def commands(mode, root, node, npm, system):
    run = [node, npm, 'run']
    if mode == 'sbom':
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
        return [run + ['common-tools:sbom', '--', '--output', 'artifacts/common-tools.spdx.json'],
                run + ['common-tools:release-evidence', '--', '--sbom', 'artifacts/common-tools.spdx.json', '--output', 'artifacts/common-tools.release.json', '--revision', revision],
                run + ['common-tools:verify-release-evidence', '--', '--sbom', 'artifacts/common-tools.spdx.json', '--manifest', 'artifacts/common-tools.release.json', '--revision', revision]]
    if mode == 'windows-full':
        if system != 'Windows':
            return []
        names = ['lint', 'typecheck', 'common-tools:verify-plugins', 'common-tools:verify-runtime-package',
                 'common-tools:verify-observability', 'common-tools:verify-adrs', 'audit:dotnet', 'build:dotnet:locked',
                 'common-tools:test', 'test:unit', 'test:contract', 'test:integration', 'verify:python-lock']
        checks = [run + [name] + (['--', '--shards', '1'] if name in ['test:unit', 'test:contract', 'test:integration'] else []) for name in names]
        return checks + commands('sbom', root, node, npm, system)
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
    parser.add_argument('mode', choices=['sbom', 'windows-full', 'linux-recovery', 'workflow-lint'])
    parser.add_argument('--node', required=True)
    parser.add_argument('--npm-cli', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    tasks = commands(args.mode, root, args.node, args.npm_cli, platform.system())
    if not tasks:
        print('DEVFOUNDRY_NOT_APPLICABLE=' + args.mode + '; ' + ('Windows-only gate' if args.mode == 'windows-full' else 'Linux-only gate'))
        return 0
    result = 0
    report = {'mode': args.mode, 'platform': platform.system(), 'commands': [], 'status': 'running'}
    target = root / '.ci-state' / ('devfoundry-' + args.mode + '.json')
    target.parent.mkdir(parents=True, exist_ok=True)
    for command in tasks:
        started = time.monotonic()
        code = subprocess.run(command, cwd=root, shell=False).returncode
        report['commands'].append({'name': command[3] if len(command) > 3 and command[2] == 'run' else args.mode,
                                   'exit_code': code, 'seconds': round(time.monotonic() - started, 2)})
        result = result or code
        target.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    report['status'] = 'failed' if result else 'passed'
    target.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('DEVFOUNDRY_PLATFORM_RESULT=' + json.dumps(report))
    return result


if __name__ == '__main__':
    sys.exit(main())
