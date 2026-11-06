import json
import tempfile
import unittest
from pathlib import Path
from subprocess import CompletedProcess
from unittest.mock import patch

from hermes_runtime import resolve_hermes_runtime


class RuntimeTest(unittest.TestCase):
    def test_legacy_does_not_pass_drive_credentials_to_the_manager(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); binary = root / 'venv/bin/python'
            binary.parent.mkdir(parents=True); binary.touch()
            python, environment = resolve_hermes_runtime(root, {'PATH': 'original', 'DRIVE_OAUTH_REFRESH_TOKEN': 'private'})
            self.assertEqual(python, str(binary))
            self.assertNotIn('DRIVE_OAUTH_REFRESH_TOKEN', environment)
            self.assertEqual(environment['PATH'], 'original')

    def test_pm_generation_preserves_its_pythonpath_and_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); module = root / 'pm/environments.py'
            module.parent.mkdir(); module.touch()
            selected = str(root / 'selected/bin/python')
            site = str(root / 'selected/site-packages')
            composed = {'PATH': str(Path(selected).parent), 'PYTHONPATH': site, 'DRIVE_OAUTH_CLIENT_SECRET': 'private'}
            with patch('hermes_runtime.subprocess.run', return_value=CompletedProcess([], 0, json.dumps(composed), '')) as run, \
                 patch('hermes_runtime.shutil.which', return_value=selected):
                python, environment = resolve_hermes_runtime(root, {'PATH': '/old/bin', 'DRIVE_OAUTH_REFRESH_TOKEN': 'private'})
                self.assertEqual(python, selected)
                self.assertEqual(environment['PYTHONPATH'], site)
                self.assertFalse(any(k.startswith('DRIVE_OAUTH_') for k in environment))
                self.assertNotIn('DRIVE_OAUTH_REFRESH_TOKEN', run.call_args.kwargs['env'])
            with patch('hermes_runtime.subprocess.run', return_value=CompletedProcess([], 1, '', 'failure')):
                with self.assertRaisesRegex(RuntimeError, 'PM environment unavailable'):
                    resolve_hermes_runtime(root, {})


if __name__ == '__main__':
    unittest.main()
