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
  let modificationEpoch = 0;
  let committedEpoch = 0;
  let pendingSaves = [];
  let lastCommitted = 0;
  let lastPublished = 0;
  let terminal = false;
  let brokerState = 'opening';
  let requestReason = null;
  let editorAvailable = false;
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
    lastCommitted = Math.max(lastCommitted, committed);
    lastPublished = Math.max(lastPublished, published);
    pendingSaves = pendingSaves.filter(function (save) {{
      if (save.seq === null) return true;
      if (lastCommitted < save.seq) {{
        return !(status && status.state === 'editing' && status.reason);
      }}
      committedEpoch = Math.max(committedEpoch, save.epoch);
      return false;
    }});
    if (status && status.state === 'closed') return false;
    return modificationEpoch > committedEpoch || lastCommitted > lastPublished;
  }}

  function applyStatus(status, extra) {{
    if (!accepted || terminal || refused || !alive) return;
    extra = extra || {{}};
    if (status && status.state) brokerState = status.state;
    if (status && status.state === 'editing' && status.reason) requestReason = status.reason;
    const state = extra.state || brokerState;
    if (state === 'orphaned' || state === 'closed' || state === 'error') {{
      terminal = true;
      stopTimers();
      document.getElementById('ocu-office-simulate-modification').disabled = true;
    }}
    postState({{
      file_id: accepted.file_id,
      generation: accepted.generation,
      session_id: status && status.session_id ? status.session_id : sessionId,
      state: state,
      dirty: extra.dirty !== undefined ? extra.dirty : computeDirty(status),
      workspace_changed: !!(status && status.workspace_changed),
      reason: extra.reason !== undefined ? extra.reason : ((status && status.reason) || requestReason)
    }});
  }}

  function stopTimers() {{
    if (pollTimer) {{ clearInterval(pollTimer); pollTimer = null; }}
    if (autoTimer) {{ clearInterval(autoTimer); autoTimer = null; }}
  }}

  function pollStatus() {{
    if (!alive || !sessionId || refused || terminal) return;
    const generation = accepted && accepted.generation;
    request('/api/office/' + encodeURIComponent(chatId) + '/sessions/' + encodeURIComponent(sessionId))
      .then(function (response) {{
        return response.json().then(function (body) {{
          return {{ ok: response.ok, body: body }};
        }});
      }})
      .then(function (result) {{
        if (!alive || terminal || !accepted || accepted.generation !== generation) return;
        if (!result.ok) {{
          applyStatus(null, {{ state: 'error', reason: (result.body && result.body.reason) || 'status_unavailable' }});
          return;
        }}
        applyStatus(result.body);
      }}).catch(function () {{
        applyStatus(null, {{ state: 'error', reason: 'status_unavailable' }});
      }});
  }}

  function startSessionWatch() {{
    if (pollTimer || !sessionId || terminal || refused) return;
    pollTimer = setInterval(pollStatus, 1000);
    autoTimer = setInterval(function () {{
      if (brokerState !== 'editing' || !editorAvailable || modificationEpoch <= committedEpoch ||
          pendingSaves.some(function (save) {{ return save.epoch >= modificationEpoch; }})) return;
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
      if (!alive || terminal || !accepted || accepted.generation !== generation) return;
      if (result.status === 201 || result.status === 200) {{
        sessionId = result.body.session_id;
        editorAvailable = !!result.body.editor_config;
        document.getElementById('ocu-office-simulate-modification').disabled = !editorAvailable;
        applyStatus({{
          session_id: sessionId,
          state: result.body.state === 'opening' ? 'editing' : result.body.state,
          last_committed_seq: 0,
          last_published_seq: 0,
          workspace_changed: false,
          reason: result.body.state === 'conflict' ? 'baseline_mismatch' : null
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
    }}).catch(function () {{
      applyStatus(null, {{ state: 'error', reason: 'create_failed' }});
    }});
  }}

  function save(intent) {{
    if (!alive || refused || terminal || !sessionId || !accepted) return;
    const generation = accepted.generation;
    const coverage = {{ epoch: modificationEpoch, seq: null }};
    pendingSaves.push(coverage);
    if (intent === 'publish') {{
      postState({{
        file_id: accepted.file_id,
        generation: generation,
        session_id: sessionId,
        state: 'saving',
        dirty: computeDirty(null),
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
      if (!alive || terminal || !accepted || accepted.generation !== generation) return;
      if (!result.ok) {{
        pendingSaves = pendingSaves.filter(function (save) {{ return save !== coverage; }});
        requestReason = (result.body && result.body.reason) || 'save_failed';
        applyStatus(null, {{ reason: requestReason }});
        pollStatus();
        return;
      }}
      requestReason = null;
      coverage.seq = result.body.save_seq;
      pollStatus();
    }}).catch(function () {{
      pendingSaves = pendingSaves.filter(function (save) {{ return save !== coverage; }});
      requestReason = 'save_failed';
      applyStatus(null, {{ reason: requestReason }});
    }});
  }}

  function closeSession() {{
    if (!alive || refused || terminal || !sessionId || !accepted) return;
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
    }}).then(function (response) {{
      return response.json().then(function (body) {{ return {{ ok: response.ok, body: body }}; }});
    }}).then(function (result) {{
      if (!alive || terminal || !accepted || accepted.generation !== generation) return;
      requestReason = result.ok ? null : ((result.body && result.body.reason) || 'close_failed');
      if (!result.ok) applyStatus(null, {{ reason: requestReason }});
      pollStatus();
    }}).catch(function () {{
      requestReason = 'close_failed';
      applyStatus(null, {{ reason: requestReason }});
    }});
  }}

  function onMessage(event) {{
    if (!alive || terminal || refused) return;
    if (event.source !== window.parent || event.origin !== origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    if (data.chat_id !== chatId) return;
    if (data.type === 'ocu:office-open') {{
      if (!exactKeys(data, OPEN_KEYS)) return;
      if (typeof data.file_id !== 'string' || !data.file_id) return;
      if (!Number.isSafeInteger(data.generation) || data.generation < 0) return;
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
    if (!alive || terminal || !accepted || refused || !editorAvailable) return;
    modificationEpoch += 1;
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
