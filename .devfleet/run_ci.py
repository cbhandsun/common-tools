#!/usr/bin/env python3
"""Self-contained native CI runner. Configuration is trusted repository code."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import platform
import re
import signal
import shutil
import subprocess
import sys
import time

SYSTEMS = {'macos': 'Darwin', 'windows': 'Windows', 'linux': 'Linux'}
SLUG = re.compile(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z')
VERSION = re.compile(r'\d+\.\d+\.\d+\Z')


def selected_systems(config):
    return {name: system for name, system in SYSTEMS.items() if name in config['runners']}


def relative_path(value):
    if not isinstance(value, str) or not value or '\\' in value or any(ord(c) < 32 for c in value):
        raise ValueError('Input paths must be portable repository-relative paths')
    path = PurePosixPath(value)
    if path.is_absolute() or PureWindowsPath(value).drive or '..' in path.parts or ':' in value or str(path) != value or value == '.':
        raise ValueError('Input path escapes repository')
    if any(p in {'.git', '.local', '.aws', '.ssh', '.npmrc'} or (p.startswith('.env') and p != '.env.example') for p in path.parts):
        raise ValueError('Secret or internal paths cannot be CI inputs')
    return value


def validate(config):
    keys = {'schema_version', 'id', 'repository', 'stack', 'reviewed', 'automatic_ci',
            'toolchain', 'inputs', 'setup', 'checks', 'runners', 'resource_group',
            'timeout_seconds', 'clear_env', 'deployment'}
    if not isinstance(config, dict) or set(config) != keys:
        raise ValueError('Project configuration has missing or unknown fields')
    if type(config['schema_version']) is not int or config['schema_version'] != 1:
        raise ValueError('Unsupported project schema version')
    if not isinstance(config['id'], str) or not SLUG.fullmatch(config['id']):
        raise ValueError('Project id must be a lowercase slug')
    repo = config['repository']
    if not isinstance(repo, dict) or set(repo) != {'owner', 'name', 'branch'}:
        raise ValueError('Repository requires owner, name and branch')
    for key in ['owner', 'name']:
        if not isinstance(repo[key], str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', repo[key]) or repo[key] in {'.', '..'}:
            raise ValueError('Invalid repository owner/name')
    if not isinstance(repo['branch'], str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_/-]*', repo['branch']) or any(v in repo['branch'] for v in ['..', '//']) or repo['branch'].endswith('/'):
        raise ValueError('Invalid repository branch')
    if config['stack'] not in {'node', 'python'}:
        raise ValueError('Only Node/npm and Python stacks are supported in schema v1')
    for key in ['reviewed', 'automatic_ci']:
        if type(config[key]) is not bool:
            raise ValueError('Review and automatic CI flags must be booleans')
    if config['automatic_ci'] and not config['reviewed']:
        raise ValueError('Automatic CI requires reviewed configuration')
    if not isinstance(config['deployment'], dict) or set(config['deployment']) != {'enabled'} or config['deployment']['enabled'] is not False:
        raise ValueError('Generic deployment is not implemented; enabled must be false')
    tools = config['toolchain']
    required = {'node', 'npm'} if config['stack'] == 'node' else {'python'}
    if not isinstance(tools, dict) or set(tools) != required:
        raise ValueError('Toolchain does not match the selected stack')
    for value in tools.values():
        if isinstance(value, str):
            values = [value]
        elif isinstance(value, dict) and set(value) == set(SYSTEMS.values()):
            values = list(value.values())
        else:
            raise ValueError('Tool versions require an exact version or all three OS versions')
        if any(not isinstance(v, str) or not VERSION.fullmatch(v) for v in values):
            raise ValueError('Tool versions must be exact major.minor.patch versions')
    if not isinstance(config['inputs'], list) or not config['inputs'] or any(not isinstance(p, str) for p in config['inputs']) or len(set(config['inputs'])) != len(config['inputs']):
        raise ValueError('Inputs must be a nonempty unique path list')
    for value in config['inputs']:
        relative_path(value)
    if '.devfleet/project.json' not in config['inputs']:
        raise ValueError('Project configuration must be a tracked input')
    if config['stack'] == 'node' and 'package-lock.json' not in config['inputs']:
        raise ValueError('Node/npm projects require package-lock.json as a locked input')
    for group in ['setup', 'checks']:
        items = config[group]
        if not isinstance(items, list) or (group == 'checks' and not items):
            raise ValueError('At least one check is required')
        names = set()
        for item in items:
            if not isinstance(item, dict) or set(item) != {'name', 'argv'}:
                raise ValueError('Commands require a name and argv array')
            if not isinstance(item['name'], str) or not SLUG.fullmatch(item['name']) or item['name'] in names:
                raise ValueError('Check names must be distinct slugs within their group')
            names.add(item['name'])
            argv = item['argv']
            if not isinstance(argv, list) or not argv or any(not isinstance(v, str) or not v or any(ord(c) < 32 for c in v) for v in argv):
                raise ValueError('Commands must be nonempty argv arrays, never shell strings')
            if any(v in {'--token', '--password', '--api-key'} for v in argv):
                raise ValueError('Do not put credential arguments in project configuration')
            for value in argv:
                if re.fullmatch(r'\{[a-z_]+\}', value) and value not in ({'{node}', '{npm_cli}', '{python}'} if config['stack'] == 'node' else {'{python}'}):
                    raise ValueError('Unknown executable placeholder')
    runners = config['runners']
    if not isinstance(runners, dict) or not runners or not set(runners).issubset(SYSTEMS) or any(not isinstance(v, str) or not SLUG.fullmatch(v) for v in runners.values()) or len(set(runners.values())) != len(runners):
        raise ValueError('Select one or more supported platforms with distinct native runner labels')
    if not isinstance(config['resource_group'], str) or not SLUG.fullmatch(config['resource_group']):
        raise ValueError('Resource group must be a slug')
    if type(config['timeout_seconds']) is not int or not 1 <= config['timeout_seconds'] <= 7200:
        raise ValueError('Each command timeout must be between 1 and 7200 seconds')
    if not isinstance(config['clear_env'], list) or any(not isinstance(v, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]*', v) for v in config['clear_env']):
        raise ValueError('clear_env accepts variable names only')
    if any(v.startswith(('NPM_CONFIG_', 'PIP_')) or v in {'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'COMSPEC', 'CI', 'PYTHONUTF8', 'PYTHONIOENCODING', 'PYTHONNOUSERSITE', 'DOTNET_ROOT', 'DOTNET_CLI_TELEMETRY_OPTOUT', 'DOTNET_NOLOGO', 'DOTNET_CLI_HOME', 'NUGET_PACKAGES'} for v in config['clear_env']):
        raise ValueError('clear_env cannot override managed runtime configuration')
    return config


@contextmanager
def resource_lock(path, timeout):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        if os.name == 'nt':
            import msvcrt
            handle.seek(0, 2)
            if handle.tell() == 0:
                handle.write(b'0'); handle.flush()
            def acquire():
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            def release():
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            def acquire():
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            def release():
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        started = time.monotonic()
        while True:
            try:
                acquire(); break
            except OSError:
                if time.monotonic() - started >= timeout:
                    raise RuntimeError('Resource lock wait timed out')
                time.sleep(.2)
        try:
            yield
        finally:
            release()


def environment(state, clear):
    allowed = ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'SystemRoot', 'COMSPEC',
               'ComSpec', 'PATHEXT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'APPDATA',
               'LOCALAPPDATA', 'LANG', 'LC_ALL', 'NO_PROXY', 'no_proxy',
               'DOTNET_ROOT', 'DOTNET_CLI_TELEMETRY_OPTOUT', 'DOTNET_NOLOGO',
               'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'ALLUSERSPROFILE', 'SYSTEMDRIVE', 'PUBLIC']
    env = {key: os.environ[key] for key in allowed if key in os.environ}
    state.mkdir(parents=True, exist_ok=True)
    for filename in ['empty-npmrc', 'empty-global-npmrc']:
        path = state / filename
        if path.exists() and path.read_bytes():
            raise RuntimeError('Managed empty npm configuration was modified')
        path.touch(exist_ok=True)
    env.update({'CI': 'true', 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8',
                'PYTHONNOUSERSITE': '1', 'PIP_CONFIG_FILE': os.devnull,
                'PIP_CACHE_DIR': str(state / 'pip-cache'),
                'NPM_CONFIG_USERCONFIG': str(state / 'empty-npmrc'),
                'NPM_CONFIG_GLOBALCONFIG': str(state / 'empty-global-npmrc'),
                'NPM_CONFIG_CACHE': str(state / 'npm-cache')})
    if env.get('DOTNET_ROOT'):
        env.update({'DOTNET_CLI_HOME': str(state / 'dotnet-home'), 'NUGET_PACKAGES': str(state / 'nuget-cache')})
    env.update({key: '' for key in clear})
    return env


def tools_for(config, env):
    tools = {'{python}': os.environ.get('DEVFLEET_PYTHON', sys.executable)}
    if config['stack'] == 'node':
        node = os.environ.get('DEVFLEET_NODE') or shutil.which('node', path=env.get('PATH'))
        if not node:
            raise RuntimeError('Node executable is not configured')
        node = str(Path(node).resolve())
        npm = os.environ.get('DEVFLEET_NPM_CLI')
        if not npm:
            candidates = [Path(node).parent / 'npm', Path(node).parent.parent / 'lib/node_modules/npm/bin/npm-cli.js', Path(node).parent / 'node_modules/npm/bin/npm-cli.js']
            npm = next((str(p.resolve()) for p in candidates if p.is_file() and (p.is_symlink() or p.name == 'npm-cli.js')), None)
        if not npm or not Path(npm).is_file():
            raise RuntimeError('npm CLI is not configured')
        tools.update({'{node}': node, '{npm_cli}': npm})
    for name, version in config['toolchain'].items():
        wanted = version[platform.system()] if isinstance(version, dict) else version
        argv = [tools['{python}'], '-c', 'import platform; print(platform.python_version())'] if name == 'python' else [tools['{node}'], '--version'] if name == 'node' else [tools['{node}'], tools['{npm_cli}'], '--version']
        actual = subprocess.check_output(argv, text=True, env=env, timeout=30).strip().lstrip('v')
        if actual != wanted:
            raise RuntimeError('Tool version mismatch: ' + name)
    return tools


def ensure_local_path(root, path):
    # Windows junctions are not always reported as symbolic links. Resolve the
    # destination as well as checking aliases before any read or write.
    if root not in path.resolve().parents:
        raise RuntimeError('Path escapes the selected repository')
    current = path
    while current != root:
        if current.is_symlink() or getattr(current, 'is_junction', lambda: False)():
            raise RuntimeError('Path aliases are not allowed below the repository root')
        current = current.parent


def input_hashes(root, paths):
    result = {}
    for value in paths:
        relative_path(value)
        path = root / value
        ensure_local_path(root, path)
        if not path.is_file():
            raise RuntimeError('Missing tracked input')
        result[value] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def command_result(argv, root, env, timeout):
    options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
    try:
        process = subprocess.Popen(argv, cwd=root, env=env, shell=False, **options)
    except OSError:
        return 127, 'spawn-failed'
    try:
        return process.wait(timeout=timeout), None
    except subprocess.TimeoutExpired:
        # Retire only the process tree created by this CI command.
        if os.name == 'nt':
            subprocess.run(['taskkill.exe', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
        else:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=3)
            except ProcessLookupError:
                pass
            except subprocess.TimeoutExpired:
                pass
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.wait(timeout=10)
        return 124, 'timeout'


def run(config, root, expected_os, state, lock, preflight=False):
    validate(config)
    if platform.system() != expected_os:
        raise RuntimeError('Native OS does not match requested OS')
    if expected_os not in selected_systems(config).values():
        raise RuntimeError('This OS is not selected for this project')
    if not config['reviewed']:
        raise RuntimeError('Project commands have not been reviewed')
    root = root.resolve()
    with resource_lock(lock, config['timeout_seconds']):
        env = environment(state, config['clear_env'])
        tools = tools_for(config, env)
        env['PATH'] = os.pathsep.join(dict.fromkeys([str(Path(value).parent) for key, value in tools.items() if key != '{npm_cli}'] + [env.get('PATH', '')]))
        def git(*args):
            return subprocess.check_output(['git', *args], cwd=root, env=env, text=True, timeout=30).strip()
        source = git('rev-parse', 'HEAD')
        if json.loads((root / '.devfleet/project.json').read_text(encoding='utf-8')) != config:
            raise RuntimeError('Working configuration differs from the requested project configuration')
        git('ls-files', '--error-unmatch', '--', '.devfleet/run_ci.py', *config['inputs'])
        before = input_hashes(root, config['inputs'])
        if subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=root, env=env).returncode:
            raise RuntimeError('Tracked source must be clean before CI')
        report = {'schema_version': 1, 'project': config['id'], 'source': source,
                  'os': platform.system(), 'arch': platform.machine(), 'scope': 'configured-checks',
                  'release_approval': False, 'deployment': False, 'inputs': before, 'commands': [], 'status': 'running'}
        def receipt():
            state.mkdir(parents=True, exist_ok=True)
            (state / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if preflight:
            report['status'] = 'preflight-only'; receipt()
            print('DEVFLEET_RESULT=' + json.dumps(report), flush=True)
            return 0
        for group in ['setup', 'checks']:
            setup_failed = False
            for command in config[group]:
                argv = [tools.get(token, token) for token in command['argv']]
                started = time.monotonic()
                code, reason = command_result(argv, root, env, config['timeout_seconds'])
                report['commands'].append({'group': group, 'name': command['name'], 'exit_code': code,
                                           'reason': reason, 'seconds': round(time.monotonic() - started, 2)})
                receipt()
                if group == 'setup' and code:
                    setup_failed = True; break
            if setup_failed:
                break
        report['source_stable'] = source == git('rev-parse', 'HEAD') and before == input_hashes(root, config['inputs']) and subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=root, env=env).returncode == 0
        report['status'] = 'passed' if report['source_stable'] and len([v for v in report['commands'] if v['group'] == 'checks']) == len(config['checks']) and all(v['exit_code'] == 0 for v in report['commands']) else 'failed'
        receipt()
        print('DEVFLEET_RESULT=' + json.dumps(report), flush=True)
        return 0 if report['status'] == 'passed' else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path(__file__).with_name('project.json'))
    parser.add_argument('--repository-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--expected-os', choices=list(SYSTEMS.values()), required=True)
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding='utf-8'))
    state_value = os.environ.get('DEVFLEET_CI_STATE')
    lock_value = os.environ.get('DEVFLEET_CI_LOCK')
    if not state_value or not lock_value:
        raise RuntimeError('Runner state and shared resource lock must be configured')
    return run(config, args.repository_root, args.expected_os, Path(state_value), Path(lock_value), args.preflight_only)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        # Do not echo command arguments, environment or untrusted file contents.
        print('DEVFLEET_ERROR=' + type(error).__name__ + ': ' + (str(error) if isinstance(error, (ValueError, RuntimeError)) else 'CI execution failed'), file=sys.stderr)
        sys.exit(1)
