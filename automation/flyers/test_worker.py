import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


@unittest.skipUnless(sys.platform == 'linux', 'Oracle worker uses Linux flock and meminfo')
class WorkerTest(unittest.TestCase):
    def test_changes_retries_and_reverting_sponsors_get_monotonic_versions(self):
        import worker
        from compose import compose, TEMPLATES
        with tempfile.TemporaryDirectory() as directory:
            source, destination, calls = [], [], []
            fail_once = [False]
            logo = (TEMPLATES / 'assets/alma.png').read_bytes()
            def upload(name, data, mime, properties, access):
                if fail_once[0] and properties['vasType'] == 'event-flyer' and properties['vasFormat'] == 'muro':
                    fail_once[0] = False
                    raise RuntimeError('Simulated interrupted second upload')
                item = {'id': 'drive_file_' + str(len(destination)), 'name': name, 'mimeType': mime,
                        'size': len(data), 'md5Checksum': hashlib.md5(data).hexdigest(), 'appProperties': properties}
                destination.append(item)
                return item
            def hermes(command, **kwargs):
                job_path = Path(command[-1]); job = json.loads(job_path.read_text())
                calls.append(job['version'])
                result = compose(job['logos'], job_path.parent / 'output', job['version'])
                (job_path.parent / 'rendered.json').write_text(json.dumps(result))
                return type('Result', (), {'returncode': 0, 'stdout': '', 'stderr': ''})()
            with patch.object(worker, 'STATE', Path(directory)), patch.object(worker, 'token', return_value='test'), \
                 patch.object(worker, 'listing', side_effect=lambda folder, _token: source if folder == worker.SOURCE else destination), \
                 patch.object(worker, 'request', return_value=logo), patch.object(worker, 'upload', side_effect=upload), \
                 patch.object(worker.subprocess, 'run', side_effect=hermes):
                worker.run(); worker.run()
                self.assertEqual(calls, [3], 'unchanged sponsor list must not call Hermes again')
                source.append({'id': 'sponsor_file_123', 'mimeType': 'image/png', 'size': len(logo),
                               'md5Checksum': hashlib.md5(logo).hexdigest()})
                fail_once[0] = True
                with self.assertRaises(RuntimeError):
                    worker.run()
                worker.run()
                self.assertEqual(calls, [3, 4], 'retry reuses render receipt and reserved version')
                v4 = [file for file in destination if file['appProperties'].get('vasVersion') == '4']
                self.assertEqual(len(v4), 3, 'no duplicate image after interrupted upload')
                source.clear()
                worker.run()
                self.assertEqual(calls, [3, 4, 5], 'removing sponsor and restoring old list creates a new version')


if __name__ == '__main__':
    unittest.main()
