"""Stub-owned embed=office host page. No DocumentServer, same-origin only."""

from __future__ import annotations

import json
from html import escape

STATE_KEYS = (
    'type',
    'chat_id',
    'file_id',
    'generation',
    'session_id',
    'state',
    'dirty',
    'workspace_changed',
    'reason',
)


def office_host_page(chat_id: str, prefix: str) -> tuple[bytes, dict[str, str]]:
    config = json.dumps({'chatId': chat_id, 'prefix': prefix}, separators=(',', ':'))
    html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>OCU Office stub</title>
<style>
#ocu-office-surface {{ min-height: 8rem; }}
#ocu-office-simulate-modification {{ display: inline-block; }}
</style>
</head>
<body>
<div id="ocu-office-surface" data-chat-id="{escape(chat_id)}">
<button id="ocu-office-simulate-modification" type="button">Simulate modification</button>
<p id="ocu-office-status"></p>
</div>
<script>
(function () {{
  const config = {config};
  const prefix = config.prefix || '';
  const chatId = config.chatId;
  const STATE_KEYS = {json.dumps(list(STATE_KEYS))};
  const OPEN_KEYS = ['type', 'chat_id', 'file_id', 'generation'];
  const COMMAND_KEYS = ['type', 'chat_id', 'generation', 'command'];
  const origin = window.location.origin;
  let accepted = null;
  let sessionId = null;
  let dirtyFromEditor = false;
  let lastCommitted = 0;
  let lastPublished = 0;
  let coveringSave = null;
  let lastState = null;
  let refused = false;
  let pollTimer = null;
  let autoTimer = null;
  let alive = true;

  function exactKeys(data, keys) {{
    const names = Object.keys(data);
    return names.length === keys.length && keys.every(function (key) {{
      return Object.prototype.hasOwnProperty.call(data, key);
    }});
  }}

  function postState(values) {{
    const message = {{
      type: 'ocu:office-state',
      chat_id: chatId,
      file_id: values.file_id,
      generation: values.generation,
      session_id: values.session_id,
      state: values.state,
      dirty: !!values.dirty,
      workspace_changed: !!values.workspace_changed,
      reason: values.reason === undefined ? null : values.reason
    }};
    const encoded = JSON.stringify(message);
    const parsed = JSON.parse(encoded);
    if (!exactKeys(parsed, STATE_KEYS)) return;
    if (lastState === encoded) return;
    lastState = encoded;
    window.parent.postMessage(message, origin);
  }}

  function request(path, options) {{
    const headers = Object.assign({{ 'X-Requested-With': 'ocu-workspace' }}, (options && options.headers) || {{}});
    return fetch(origin + prefix + path, Object.assign({{}}, options, {{ headers: headers }}));
  }}

  function computeDirty(status) {{
    const committed = status && typeof status.last_committed_seq === 'number'
      ? status.last_committed_seq : lastCommitted;
    const published = status && typeof status.last_published_seq === 'number'
      ? status.last_published_seq : lastPublished;
    lastCommitted = committed;
    lastPublished = published;
    const covered = coveringSave !== null && committed >= coveringSave;
    if (covered) {{
      coveringSave = null;
      dirtyFromEditor = false;
    }}
    if (status && status.state === 'closed') return false;
    return dirtyFromEditor || committed > published;
  }}

  function applyStatus(status, extra) {{
    if (!accepted) return;
    extra = extra || {{}};
    postState({{
      file_id: accepted.file_id,
      generation: accepted.generation,
      session_id: status && status.session_id ? status.session_id : sessionId,
      state: extra.state || (status && status.state) || 'editing',
      dirty: extra.dirty !== undefined ? extra.dirty : computeDirty(status),
      workspace_changed: !!(status && status.workspace_changed),
      reason: extra.reason !== undefined ? extra.reason : (status && status.reason)
    }});
    if (status && (status.state === 'orphaned' || status.state === 'closed' || status.state === 'error')) {{
      stopTimers();
    }}
  }}

  function stopTimers() {{
    if (pollTimer) {{ clearInterval(pollTimer); pollTimer = null; }}
    if (autoTimer) {{ clearInterval(autoTimer); autoTimer = null; }}
  }}

  function pollStatus() {{
    if (!alive || !sessionId || refused) return;
    const generation = accepted && accepted.generation;
    request('/api/office/' + encodeURIComponent(chatId) + '/sessions/' + encodeURIComponent(sessionId))
      .then(function (response) {{
        return response.json().then(function (body) {{
          return {{ ok: response.ok, body: body }};
        }});
      }})
      .then(function (result) {{
        if (!alive || !accepted || accepted.generation !== generation) return;
        if (!result.ok) {{
          postState({{
            file_id: accepted.file_id,
            generation: accepted.generation,
            session_id: sessionId,
            state: 'error',
            dirty: computeDirty(null),
            workspace_changed: false,
            reason: (result.body && result.body.reason) || 'status_unavailable'
          }});
          stopTimers();
          return;
        }}
        applyStatus(result.body);
      }});
  }}

  function startSessionWatch() {{
    if (pollTimer || !sessionId) return;
    pollTimer = setInterval(pollStatus, 1000);
    autoTimer = setInterval(function () {{
      if (!dirtyFromEditor || coveringSave !== null) return;
      save('persist');
    }}, 300000);
  }}

  function createSession(fileId) {{
    const generation = accepted.generation;
    postState({{
      file_id: fileId,
      generation: generation,
      session_id: null,
      state: 'opening',
      dirty: false,
      workspace_changed: false,
      reason: null
    }});
    request('/api/office/' + encodeURIComponent(chatId) + '/documents/' + encodeURIComponent(fileId) + '/sessions', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: '{{}}'
    }}).then(function (response) {{
      return response.json().then(function (body) {{ return {{ status: response.status, body: body }}; }});
    }}).then(function (result) {{
      if (!alive || !accepted || accepted.generation !== generation) return;
      if (result.status === 201 || result.status === 200) {{
        sessionId = result.body.session_id;
        applyStatus({{
          session_id: sessionId,
          state: 'editing',
          last_committed_seq: 0,
          last_published_seq: 0,
          workspace_changed: false,
          reason: null
        }});
        startSessionWatch();
        return;
      }}
      refused = true;
      postState({{
        file_id: fileId,
        generation: generation,
        session_id: null,
        state: 'refused',
        dirty: false,
        workspace_changed: false,
        reason: (result.body && result.body.reason) || 'unsupported_type'
      }});
    }});
  }}

  function save(intent) {{
    if (!alive || refused || !sessionId || !accepted) return;
    const generation = accepted.generation;
    if (intent === 'publish') {{
      coveringSave = null;
      postState({{
        file_id: accepted.file_id,
        generation: generation,
        session_id: sessionId,
        state: 'saving',
        dirty: true,
        workspace_changed: false,
        reason: null
      }});
    }}
    request('/api/office/' + encodeURIComponent(chatId) + '/sessions/' + encodeURIComponent(sessionId) + '/save', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ intent: intent }})
    }}).then(function (response) {{
      return response.json().then(function (body) {{ return {{ ok: response.ok, body: body }}; }});
    }}).then(function (result) {{
      if (!alive || !accepted || accepted.generation !== generation) return;
      if (!result.ok) {{
        if (result.body && result.body.reason === 'session_not_editing') return;
        applyStatus(null, {{
          state: 'editing',
          dirty: computeDirty(null),
          reason: (result.body && result.body.reason) || 'save_failed'
        }});
        return;
      }}
      if (intent === 'publish') coveringSave = result.body.save_seq;
      pollStatus();
    }});
  }}

  function closeSession() {{
    if (!alive || refused || !sessionId || !accepted) return;
    const generation = accepted.generation;
    postState({{
      file_id: accepted.file_id,
      generation: generation,
      session_id: sessionId,
      state: 'closing',
      dirty: computeDirty(null),
      workspace_changed: false,
      reason: null
    }});
    request('/api/office/' + encodeURIComponent(chatId) + '/sessions/' + encodeURIComponent(sessionId) + '/close', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: '{{}}'
    }}).then(function () {{
      if (!alive || !accepted || accepted.generation !== generation) return;
      pollStatus();
    }});
  }}

  function onMessage(event) {{
    if (!alive) return;
    if (event.source !== window.parent || event.origin !== origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    if (data.chat_id !== chatId) return;
    if (data.type === 'ocu:office-open') {{
      if (!exactKeys(data, OPEN_KEYS)) return;
      if (typeof data.file_id !== 'string' || !data.file_id) return;
      if (!Number.isInteger(data.generation) || data.generation < 0) return;
      if (accepted) return;
      accepted = {{ file_id: data.file_id, generation: data.generation }};
      createSession(data.file_id);
      return;
    }}
    if (data.type === 'ocu:office-command') {{
      if (!exactKeys(data, COMMAND_KEYS)) return;
      if (!accepted || data.generation !== accepted.generation) return;
      if (data.command === 'save') save('publish');
      else if (data.command === 'close') closeSession();
    }}
  }}

  window.addEventListener('message', onMessage);
  window.addEventListener('pagehide', function () {{
    alive = false;
    stopTimers();
    window.removeEventListener('message', onMessage);
  }});
  document.getElementById('ocu-office-simulate-modification').addEventListener('click', function () {{
    if (!accepted || refused) return;
    dirtyFromEditor = true;
    coveringSave = null;
    postState({{
      file_id: accepted.file_id,
      generation: accepted.generation,
      session_id: sessionId,
      state: 'editing',
      dirty: true,
      workspace_changed: false,
      reason: null
    }});
  }});
  window.parent.postMessage({{ type: 'ocu:office-ready', chat_id: chatId }}, origin);
}})();
</script>
</body>
</html>
"""
    headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Security-Policy': (
            "default-src 'none'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-src 'none'; "
            "base-uri 'none'; "
            "object-src 'none'; "
            "form-action 'none'; "
            "frame-ancestors 'self'"
        ),
    }
    return html.encode(), headers
