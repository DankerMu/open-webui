"""OCU /system-prompt and an OpenAI-compatible model, so a browser send runs the real filter chain."""

from __future__ import annotations

import base64
import json
import re
import struct
import zlib

STUB_MODEL = 'ocu-stub-model'
PROMPT_RE = re.compile(r'OCU stub system prompt \(features: [a-z,]+\)\.')


def system_prompt(header: str | None, prefix: str) -> tuple[int, bytes, str, dict[str, str]]:
    """Mirror OCU's parse_prompt_features: only video is known, anything else fails loud."""
    names = [name.strip() for name in header.split(',')] if header and header.strip() else []
    if any(name != 'video' for name in names):
        return 400, b'{"detail": "unknown prompt feature"}', 'application/json; charset=utf-8', {}
    prompt = f'OCU stub system prompt (features: {",".join(names) or "none"}).'
    return 200, prompt.encode(), 'text/plain; charset=utf-8', {'X-Public-Base-URL': prefix}


# The call a native-function-calling model makes when WebUI offers generate_image.
IMAGE_CALL = {
    'index': 0,
    'id': 'call_stub_generate_image',
    'type': 'function',
    'function': {'name': 'generate_image', 'arguments': '{"prompt": "A stub image", "aspect_ratio": "16:9"}'},
}


# A reasoning model's thinking before the call; WebUI groups it with the call into one collapsed row.
THINKING = 'Planning the picture before drawing it.'


def _last_turn(request: dict) -> list[dict]:
    """The latest user message and everything after it."""
    messages = request.get('messages', [])
    users = [index for index, message in enumerate(messages) if message.get('role') == 'user']
    return messages[users[-1] :] if users else messages


def _calls_image_tool(request: dict) -> bool:
    """Call generate_image once per user turn when it is offered; after the tool result, answer in text."""
    offered = {tool.get('function', {}).get('name') for tool in request.get('tools') or []}
    answered = any(message.get('role') == 'tool' for message in _last_turn(request))
    return 'generate_image' in offered and not answered


def _thinks_first(request: dict) -> bool:
    """A user message that says "think" gets the call after a reasoning block."""
    content = _last_turn(request)[0].get('content') if _last_turn(request) else None
    return isinstance(content, str) and 'think' in content.lower()


def _png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    rows = b''.join(b'\x00' + bytes(rgb) * width for _ in range(height))
    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')


def image_generation() -> tuple[bytes, str]:
    """An OpenAI /images/generations reply: one 320x180 (16:9) orange PNG as b64_json."""
    image = base64.b64encode(_png(320, 180, (251, 146, 60))).decode()
    return json.dumps({'created': 0, 'data': [{'b64_json': image}]}).encode(), 'application/json; charset=utf-8'


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
    message, finish = {'role': 'assistant', 'content': reply}, 'stop'
    if _calls_image_tool(request):
        message, finish = {'role': 'assistant', 'content': None, 'tool_calls': [IMAGE_CALL]}, 'tool_calls'
        if _thinks_first(request):
            message['reasoning_content'] = THINKING
    if not request.get('stream'):
        choice = {'index': 0, 'message': message, 'finish_reason': finish}
        body = {'object': 'chat.completion', 'model': STUB_MODEL, 'choices': [choice]}
        return json.dumps(body).encode(), 'application/json; charset=utf-8'
    # Streamed, the reasoning arrives in its own chunk before the call, as a reasoning model sends it.
    deltas = [{'role': 'assistant', 'reasoning_content': THINKING}] if 'reasoning_content' in message else []
    deltas.append({key: value for key, value in message.items() if value is not None and key != 'reasoning_content'})
    chunks = (
        *({'index': 0, 'delta': delta, 'finish_reason': None} for delta in deltas),
        {'index': 0, 'delta': {}, 'finish_reason': finish},
    )
    events = ''.join(
        f'data: {json.dumps({"object": "chat.completion.chunk", "model": STUB_MODEL, "choices": [chunk]})}\n\n'
        for chunk in chunks
    )
    return (events + 'data: [DONE]\n\n').encode(), 'text/event-stream'
