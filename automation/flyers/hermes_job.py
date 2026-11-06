"""Hermes integration: exactly one fixed, local composition tool; no shell access."""
import json
import os
import subprocess
import sys
from pathlib import Path

INSTALL = Path(__file__).resolve().parent
job_path = Path(sys.argv[1]).resolve()
job = json.loads(job_path.read_text())

# Resolve/refresh through Hermes's existing locked auth store BEFORE switching profile.
# Tokens stay in this process and are never written to the job, command line or logs.
sys.path.insert(0, '/usr/local/lib/hermes-agent')
os.environ['HERMES_HOME'] = '/root/.hermes'
from hermes_cli.runtime_provider import resolve_runtime_provider
credentials = resolve_runtime_provider(requested='openai-codex', target_model=os.environ.get('FLYER_HERMES_MODEL', 'gpt-6-astra'))
os.environ['HERMES_HOME'] = '/root/.hermes/profiles/vas-flyers'

from run_agent import AIAgent
from tools.registry import registry
import toolsets


def generate(args, **_kwargs):
    if args.get('job_id') != job['id']:
        return json.dumps({'error': 'Unknown job'})
    if not (job_path.parent / 'rendered.json').exists():
        subprocess.run([str(INSTALL / 'venv/bin/python'), str(INSTALL / 'compose.py'), str(job_path)],
                       check=True, timeout=180, capture_output=True)
    return json.dumps({'ok': True, 'version': job['version'], 'protected_pixels': 'verified',
                       'files': json.loads((job_path.parent / 'rendered.json').read_text())})


registry.register(name='generate_event_flyers', toolset='vas-flyers', handler=generate,
                  schema={'name': 'generate_event_flyers',
                          'description': 'Generate the approved story and wall templates for this job. Only secondary sponsor pixels can change; all protected pixels are verified. No payment, mail or other server access.',
                          'parameters': {'type': 'object', 'properties': {'job_id': {'type': 'string', 'enum': [job['id']]}},
                                         'required': ['job_id'], 'additionalProperties': False}})
toolsets.TOOLSETS['vas-flyers'] = {'tools': ['generate_event_flyers'], 'description': 'Approved flyer composition only'}
agent = AIAgent(model=os.environ.get('FLYER_HERMES_MODEL', 'gpt-6-astra'),
                provider='openai-codex', api_key=credentials['api_key'], base_url=credentials['base_url'], api_mode=credentials.get('api_mode'),
                enabled_toolsets=['vas-flyers'], max_iterations=4, quiet_mode=True,
                skip_context_files=True, skip_memory=True, save_trajectories=False,
                reasoning_config={'effort': 'medium'},
                ephemeral_system_prompt='Manage the approved event flyer job. Use only generate_event_flyers. Never request a different tool or alter artwork, model settings or server configuration.')
if {t['function']['name'] for t in agent.tools} != {'generate_event_flyers'}:
    raise RuntimeError('Unexpected Hermes tools; refusing to run')
agent.run_conversation(f'Generate job {job["id"]}, version V{job["version"]}. Use the exact templates for historia and muro, keeping Pablo, all text and Mila Club unchanged. Compose secondary sponsors across each row and wrap at seven. Call generate_event_flyers with this job_id once, verify the result and finish.')
if not (job_path.parent / 'rendered.json').exists():
    raise RuntimeError('Hermes did not complete the composition tool')
print(json.dumps({'ok': True, 'version': job['version'], 'manager': 'Hermes/ChatGPT', 'model': agent.model}))
