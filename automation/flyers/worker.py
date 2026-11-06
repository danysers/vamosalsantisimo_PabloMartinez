"""One serialized sync per timer tick. No listening ports or public AI endpoint."""
import fcntl
import hashlib
import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from hermes_runtime import resolve_hermes_runtime

ROOT = Path(__file__).resolve().parent
STATE = Path(os.environ.get('FLYER_STATE_DIR', '/var/lib/vas-flyers'))
SOURCE = '1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68'
DESTINATION = '1QMFs67vBo8rY87oARIVSmxZDd1F-j6fJ'
OWNERS = {'danysers@gmail.com', 'vamosalsantisimof@gmail.com'}
API = 'https://www.googleapis.com/drive/v3/files'
MAX_IMAGE = 4 * 1024 * 1024
EXTENSIONS = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}


def atomic(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False))
    temporary.chmod(0o600)
    temporary.replace(path)


def request(url, token=None, data=None, headers=None, limit=8 * 1024 * 1024):
    h = dict(headers or {})
    if token:
        h['Authorization'] = 'Bearer ' + token
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=40) as response:
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ValueError('Drive response exceeds size limit')
        return body


def token():
    body = urllib.parse.urlencode({'client_id': os.environ['DRIVE_OAUTH_CLIENT_ID'],
                                  'client_secret': os.environ['DRIVE_OAUTH_CLIENT_SECRET'],
                                  'refresh_token': os.environ['DRIVE_OAUTH_REFRESH_TOKEN'],
                                  'grant_type': 'refresh_token'}).encode()
    return json.loads(request('https://oauth2.googleapis.com/token', data=body))['access_token']


def trusted(file):
    return any(o.get('emailAddress', '').lower() in OWNERS for o in file.get('owners', []))


def listing(folder, access):
    metadata = json.loads(request(f'{API}/{folder}?fields=id,mimeType,trashed,owners(emailAddress)', access))
    if metadata.get('id') != folder or metadata.get('trashed') or metadata.get('mimeType') != 'application/vnd.google-apps.folder' or not trusted(metadata):
        raise ValueError('Drive folder identity/owner mismatch')
    files, page = [], None
    while True:
        params = {'q': f"'{folder}' in parents and trashed = false", 'pageSize': '100',
                  'fields': 'nextPageToken,files(id,name,mimeType,size,md5Checksum,createdTime,owners(emailAddress),appProperties)'}
        if page:
            params['pageToken'] = page
        result = json.loads(request(API + '?' + urllib.parse.urlencode(params), access))
        files += result['files']
        if len(files) > 1000:
            raise ValueError('Drive folder exceeds limit')
        page = result.get('nextPageToken')
        if not page:
            break
    return [file for file in files if trusted(file)]


def valid_logo(file):
    return (re.fullmatch(r'[A-Za-z0-9_-]{10,100}', file.get('id', '')) and
            file.get('mimeType') in EXTENSIONS and re.fullmatch(r'[a-f0-9]{32}', file.get('md5Checksum', '')) and
            0 < int(file.get('size', 0)) <= MAX_IMAGE)


def upload(name, data, mime, properties, access):
    boundary = 'vas-' + uuid.uuid4().hex
    metadata = json.dumps({'name': name, 'parents': [DESTINATION], 'mimeType': mime, 'appProperties': properties}).encode()
    body = (f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'.encode() + metadata +
            f'\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n'.encode() + data + f'\r\n--{boundary}--\r\n'.encode())
    result = json.loads(request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,md5Checksum,appProperties',
                                access, body, {'Content-Type': f'multipart/related; boundary={boundary}'}))
    if int(result.get('size', 0)) != len(data) or result.get('md5Checksum') != hashlib.md5(data).hexdigest():
        raise ValueError('Drive upload checksum mismatch')
    return result


def run():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / 'worker.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        memory = dict((line.split(':')[0], int(line.split()[1])) for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemTotal:', 'MemAvailable:')))
        if memory['MemAvailable'] / memory['MemTotal'] < 0.15:
            print('Flyers deferred: host memory high', flush=True)
            return
        access = token()
        source = sorted(filter(valid_logo, listing(SOURCE, access)), key=lambda f: (f.get('createdTime', ''), f['id']))
        if len(source) > 80:
            raise ValueError('Too many sponsors; refused to silently drop logos')
        pins = json.loads((ROOT / 'templates/protected-sha256.json').read_text())
        revision = hashlib.sha256(json.dumps({'templates': pins, 'logos': [[f['id'], f['md5Checksum']] for f in source], 'layout': 1}, sort_keys=True).encode()).hexdigest()
        state_path = STATE / 'state.json'
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        if state.get('published') == revision:
            return
        # A reversion to an older sponsor set is a NEW version, not a rollback.
        # Pending id survives retries/crashes; previous commit distinguishes transitions.
        pending = state.get('pending', {})
        job_id = pending.get('id') if pending.get('revision') == revision else hashlib.sha256((revision + state.get('commit', 'initial')).encode()).hexdigest()
        atomic(state_path, {**state, 'pending': {'id': job_id, 'revision': revision}})
        destination = listing(DESTINATION, access)
        committed = next((f for f in destination if f.get('appProperties', {}).get('vasJob') == job_id and f.get('appProperties', {}).get('vasType') == 'event-commit'), None)
        if committed:
            atomic(state_path, {'published': revision, 'commit': committed['id']})
            return
        job_dir = STATE / 'jobs' / job_id
        job_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        job_path = job_dir / 'job.json'
        if not job_path.exists():
            versions = [2]
            for file in destination:
                name = file.get('name', '').lower()
                if ('evento' in name or file.get('appProperties', {}).get('vasType', '').startswith('event-')):
                    match = re.search(r'v(\d+)', name)
                    if match:
                        versions.append(int(match[1]))
            atomic(job_path, {'id': job_id, 'version': max(versions) + 1, 'logos': []})
        job = json.loads(job_path.read_text())
        paths = []
        logo_cache = STATE / 'logos'
        logo_cache.mkdir(exist_ok=True, mode=0o700)
        for file in source:
            # Share immutable originals between versions instead of copying every
            # accumulated logo into every job (quadratic disk growth).
            path = logo_cache / (file['id'] + '-' + file['md5Checksum'] + '.' + EXTENSIONS[file['mimeType']])
            valid_cached = path.exists() and path.stat().st_size == int(file['size']) and hashlib.md5(path.read_bytes()).hexdigest() == file['md5Checksum']
            if not valid_cached:
                data = request(f"{API}/{file['id']}?alt=media", access, limit=MAX_IMAGE)
                if len(data) != int(file['size']) or hashlib.md5(data).hexdigest() != file['md5Checksum']:
                    raise ValueError('Sponsor download checksum mismatch')
                path.write_bytes(data)
            paths.append(str(path))
        job['logos'] = paths
        atomic(job_path, job)
        if not (job_dir / 'rendered.json').exists():
            # Exactly one bounded Hermes session per changed sponsor set; retry on next timer tick.
            python, hermes_env = resolve_hermes_runtime()
            result = subprocess.run([python, str(ROOT / 'hermes_job.py'), str(job_path)],
                                    env=hermes_env, capture_output=True, text=True, timeout=300)
            # Private diagnostic file, no attendee data. Never copy model/raw auth output to public logs.
            (job_dir / 'hermes.log').write_text(result.stdout + result.stderr)
            (job_dir / 'hermes.log').chmod(0o600)
            if result.returncode:
                raise RuntimeError('Hermes job failed; see private job log')
        rendered = json.loads((job_dir / 'rendered.json').read_text())
        files = []
        for artifact in rendered:
            data = (job_dir / 'output' / artifact['name']).read_bytes()
            if hashlib.sha256(data).hexdigest() != artifact['sha256']:
                raise ValueError('Rendered artifact changed')
            properties = {'vasType': 'event-flyer', 'vasJob': job_id, 'vasVersion': str(job['version']),
                          'vasFormat': artifact['format'], 'vasPage': str(artifact['page'])}
            existing = next((f for f in destination if f.get('appProperties') == properties and f.get('md5Checksum') == hashlib.md5(data).hexdigest()), None)
            uploaded = existing or upload(artifact['name'], data, 'image/png', properties, access)
            files.append({'id': uploaded['id'], 'name': artifact['name'], 'format': artifact['format'],
                          'page': artifact['page'], 'pages': artifact['pages'], 'size': len(data),
                          'md5': hashlib.md5(data).hexdigest(), 'sha256': artifact['sha256']})
        # Commit is uploaded last: the web never selects a half-uploaded pair.
        access = token()
        commit = {'schema': 1, 'version': job['version'], 'job': job_id, 'generatedAt': int(time.time()), 'files': files}
        uploaded = upload(f'flyers-evento-publicados-v{job["version"]}.json', json.dumps(commit).encode(), 'application/json',
                          {'vasType': 'event-commit', 'vasJob': job_id, 'vasVersion': str(job['version'])}, access)
        atomic(state_path, {'published': revision, 'version': job['version'], 'commit': uploaded['id']})
        print(f'Published event flyers V{job["version"]}: {len(files)} files, protected pixels verified', flush=True)


if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        # HTTP errors include status, never request headers/tokens. Other errors use a bounded message.
        print(f'Flyer sync paused: {type(error).__name__}: {str(error)[:180]}', flush=True)
        raise SystemExit(1)
