"""Use Hermes's selected dependency generation; keep the pre-PM fallback."""
import json
import os
import shutil
import subprocess
from pathlib import Path


def resolve_hermes_runtime(source=Path('/usr/local/lib/hermes-agent'), environment=None):
    source = Path(source)
    # The manager needs its own ChatGPT auth, never the Drive upload credential.
    clean = {key: value for key, value in (os.environ if environment is None else environment).items()
             if not key.startswith('DRIVE_OAUTH_')}
    clean.setdefault('HERMES_HOME', '/root/.hermes')
    if (source / 'pm/environments.py').is_file():
        result = subprocess.run(['/usr/bin/python3', '-m', 'pm.environments', '--format', 'json'],
                                cwd=source, env=clean, capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError('Hermes PM environment unavailable; prepare its dependencies first')
        try:
            composed = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise RuntimeError('Invalid Hermes PM environment') from None
        if not isinstance(composed, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in composed.items()) or not composed.get('PATH'):
            raise RuntimeError('Invalid Hermes PM environment')
        composed = {k: v for k, v in composed.items() if not k.startswith('DRIVE_OAUTH_')}
        python = shutil.which('python', path=composed['PATH'])
        if not python or not Path(python).is_absolute():
            raise RuntimeError('Hermes PM did not select an executable Python')
        return python, composed
    legacy = source / 'venv/bin/python'
    if not legacy.is_file():
        raise RuntimeError('Hermes runtime is not installed')
    return str(legacy), clean
