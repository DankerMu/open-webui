"""OCU /system-prompt and an OpenAI-compatible model, so a browser send runs the real filter chain."""

from __future__ import annotations

import json
import re

STUB_MODEL = 'ocu-stub-model'
PROMPT_RE = re.compile(r'OCU stub system prompt \(features: [a-z,]+\)\.')


def system_prompt(header: str | None, prefix: str) -> tuple[int, bytes, str, dict[str, str]]:
    """Mirror OCU's parse_prompt_features: only video is known, anything else fails loud."""
    names = [name.strip() for name in header.split(',')] if header and header.strip() else []
    if any(name != 'video' for name in names):
        return 400, b'{"detail": "unknown prompt feature"}', 'application/json; charset=utf-8', {}
    prompt = f'OCU stub system prompt (features: {",".join(names) or "none"}).'
    return 200, prompt.encode(), 'text/plain; charset=utf-8', {'X-Public-Base-URL': prefix}


def model_list() -> dict:
    return {'object': 'list', 'data': [{'id': STUB_MODEL, 'object': 'model', 'owned_by': 'ocu-stub'}]}


def chat_completion(payload: bytes) -> tuple[bytes, str]:
    """Reply with the stub prompt the system message carries, so the UI shows what the filter injected."""
    request = json.loads(payload or b'{}')
    system = ' '.join(
        message['content']
        for message in request.get('messages', [])
        if message.get('role') == 'system' and isinstance(message.get('content'), str)
    )
    seen = PROMPT_RE.search(system)
    reply = f'Stub reply. Saw: {seen.group(0) if seen else "no OCU system prompt."}'
    if not request.get('stream'):
        choice = {'index': 0, 'message': {'role': 'assistant', 'content': reply}, 'finish_reason': 'stop'}
        body = {'object': 'chat.completion', 'model': STUB_MODEL, 'choices': [choice]}
        return json.dumps(body).encode(), 'application/json; charset=utf-8'
    chunks = (
        {'index': 0, 'delta': {'role': 'assistant', 'content': reply}, 'finish_reason': None},
        {'index': 0, 'delta': {}, 'finish_reason': 'stop'},
    )
    events = ''.join(
        f'data: {json.dumps({"object": "chat.completion.chunk", "model": STUB_MODEL, "choices": [chunk]})}\n\n'
        for chunk in chunks
    )
    return (events + 'data: [DONE]\n\n').encode(), 'text/event-stream'
