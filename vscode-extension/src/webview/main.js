/**
 * Nexus SDLC — Webview Client Script.
 * Handles VS Code API communication, message rendering, mode switching, and input management.
 */
(function () {
  // @ts-ignore — acquireVsCodeApi is injected by VS Code
  const vscode = acquireVsCodeApi();

  // ── DOM References ──────────────────────────────────────
  const chatContainer = document.getElementById('chat-container');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const modeIndicator = document.getElementById('mode-indicator');
  const serverStatus = document.getElementById('server-status');

  let currentMode = 'command';
  let isProcessing = false;

  // ── Mode Colors ─────────────────────────────────────────
  const MODE_COLORS = {
    command: '#00ff88',
    git: '#ff66ff',
    security: '#ff4444',
    devops: '#ffcc00',
    agile: '#4488ff',
  };

  const MODE_LABELS = {
    command: 'nexus',
    git: 'git',
    security: 'security',
    devops: 'devops',
    agile: 'agile',
  };

  // ── Initialization ──────────────────────────────────────
  vscode.postMessage({ type: 'ready' });

  // ── Input Handling ──────────────────────────────────────
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  sendBtn.addEventListener('click', sendMessage);

  // ── Mode Buttons ────────────────────────────────────────
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (mode) {
        switchMode(mode);
        vscode.postMessage({ type: 'switchMode', mode });
      }
    });
  });


  // ── Hints ───────────────────────────────────────────────
  document.querySelectorAll('.hint').forEach((hint) => {
    hint.addEventListener('click', () => {
      const text = hint.getAttribute('data-hint');
      if (text) {
        chatInput.value = text;
        sendMessage();
      }
    });
  });

  // ── Send Message ────────────────────────────────────────
  // ── WebSocket Connection State ───────────────────────────
  let ws = null;
  let wsUrl = '';
  let reconnectTimer = null;
  let serverUrl = 'http://127.0.0.1:9500';

  function initWebSocket(baseUrl) {
    serverUrl = baseUrl;
    // Replace http:// or https:// with ws:// or wss://
    wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws/chat';
    connectWebSocket();
  }

  function connectWebSocket() {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }

    console.log('Connecting to WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      updateServerStatus(true);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      updateServerStatus(false);
      // Auto-reconnect if server status is presumably online
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectWebSocket();
        }, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      updateServerStatus(false);
    };
  }

  function handleServerMessage(data) {
    switch (data.type) {
      case 'thinking':
        addThinking();
        break;

      case 'thought':
        addThoughtBlock(data.message);
        break;

      case 'response':
        addAssistantMessage(data.message, data.changes, false);
        if (data.mode) {
          switchMode(data.mode);
          vscode.postMessage({ type: 'switchMode', mode: data.mode });
        }
        break;

      case 'clarification':
        addClarificationQuestion(data.question);
        break;

      case 'permission_request':
        addPermissionRequest(data.id, data.tool, data.args, data.thought, data.message);
        break;

      case 'error':
        addAssistantMessage(data.message, null, true);
        break;
    }
  }

  // ── Send Message ────────────────────────────────────────
  function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || isProcessing) return;

    // Remove welcome message if still shown
    const welcome = chatContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    addUserMessage(message);
    chatInput.value = '';
    chatInput.style.height = 'auto';

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat', message, mode: currentMode }));
    } else {
      addAssistantMessage('✗ Not connected to Nexus Agent server. Please start the server and try again.', null, true);
    }
  }

  // ── Mode Switching ──────────────────────────────────────
  function switchMode(mode) {
    currentMode = mode;

    // Update mode buttons
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });

    // Update mode indicator
    modeIndicator.textContent = MODE_LABELS[mode] || mode;
    modeIndicator.style.color = MODE_COLORS[mode] || MODE_COLORS.command;
    modeIndicator.style.background = hexToRgba(MODE_COLORS[mode] || MODE_COLORS.command, 0.08);

    // Update CSS accent
    document.documentElement.style.setProperty('--accent', MODE_COLORS[mode] || MODE_COLORS.command);
  }

  // ── Message Rendering ─────────────────────────────────

  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message message-user';
    div.innerHTML = `
      <span class="message-label">You</span>
      <div class="message-bubble">${escapeHtml(text)}</div>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
  }

  function addAssistantMessage(text, changes, isError) {
    removeThinking();

    const div = document.createElement('div');
    div.className = `message message-assistant${isError ? ' message-error' : ''}`;

    let html = `<span class="message-label">Nexus</span>`;
    html += `<div class="message-bubble">${formatRichText(text)}</div>`;

    // File changes
    if (changes && changes.length > 0) {
      html += `<div class="file-changes">`;
      html += `<div class="file-changes-title">📁 Files Modified</div>`;
      for (const change of changes) {
        const icon = change.action === 'delete' ? '🗑️' : change.action === 'create' ? '✨' : '📄';
        html += `<div class="file-change-item">${icon} ${escapeHtml(change.path)} (${change.action})</div>`;
      }
      html += `</div>`;
    }

    div.innerHTML = html;
    chatContainer.appendChild(div);
    scrollToBottom();
  }

  function addThoughtBlock(thought) {
    if (!thought) return;
    const div = document.createElement('div');
    div.className = 'thought-block';
    div.innerHTML = `💡 <em>Thought:</em> ${formatRichText(thought)}`;
    chatContainer.appendChild(div);
    scrollToBottom();
  }

  function addClarificationQuestion(question) {
    removeThinking();
    isProcessing = false;

    const div = document.createElement('div');
    div.className = 'message message-assistant';
    div.innerHTML = `
      <span class="message-label" style="color: var(--devops-yellow)">Nexus (Clarification)</span>
      <div class="message-bubble" style="border-color: var(--devops-yellow); background: rgba(255, 204, 0, 0.03);">${formatRichText(question)}</div>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
    chatInput.focus();
  }

  function addPermissionRequest(id, tool, args, thought, message) {
    removeThinking();
    isProcessing = true;
    chatInput.disabled = true;
    chatInput.classList.add('chat-input-disabled');
    sendBtn.disabled = true;

    const div = document.createElement('div');
    div.className = 'permission-box';

    let argsStr = '';
    if (tool === 'run_command') {
      argsStr = args.cmd || '';
    } else {
      argsStr = JSON.stringify(args, null, 2);
    }

    div.innerHTML = `
      <div class="permission-header">🔑 Permission Required</div>
      <div class="permission-body">
        ${thought ? `<p class="permission-thought">Thought: "${formatRichText(thought)}"</p>` : ''}
        ${message ? `<p>${formatRichText(message)}</p>` : ''}
        <p>Wants to execute <strong>${escapeHtml(tool)}</strong>:</p>
        <pre><code>${escapeHtml(argsStr)}</code></pre>
      </div>
      <div class="permission-actions">
        <button class="action-btn deny-btn" id="deny-${id}">Deny</button>
        <button class="action-btn allow-btn" id="allow-${id}">Allow</button>
      </div>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();

    const allowBtn = div.querySelector(`#allow-${id}`);
    const denyBtn = div.querySelector(`#deny-${id}`);

    const handleResponse = (allowed) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'permission_response',
          id: id,
          allowed: allowed
        }));
      }

      div.querySelector('.permission-actions').innerHTML = `
        <span class="mode-indicator" style="background: ${allowed ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)'}; color: ${allowed ? 'var(--nexus-green)' : '#ff6666'};">
          ${allowed ? '✓ Allowed' : '✗ Denied'}
        </span>
      `;

      chatInput.disabled = false;
      chatInput.classList.remove('chat-input-disabled');
      sendBtn.disabled = false;
      isProcessing = false;
      chatInput.focus();
    };

    allowBtn.addEventListener('click', () => handleResponse(true));
    denyBtn.addEventListener('click', () => handleResponse(false));
  }

  function addOutputPanel(title, output) {
    removeThinking();

    const div = document.createElement('div');
    div.className = 'output-panel';

    // Detect if output is a list of Jira-style items:
    // e.g. "• [SCRUM-16] Title — (Status)"
    const isJiraList = output && output.length > 0 &&
      output.some(l => /[•*]\s*\[([A-Z]+-\d+)\]/.test(l) || /•\s+\[?[A-Z]+-\d+/.test(l));

    // Detect if output looks like a structured list of bullet items
    const isBulletList = !isJiraList && output && output.length > 1 &&
      output.filter(l => /^[•*▪▸→\-]\s+/.test(l.trim())).length >= Math.ceil(output.length * 0.4);

    if (isJiraList || isBulletList) {
      div.innerHTML = renderRichPanel(title, output);
    } else {
      let bodyHtml = '';
      for (const line of output) {
        bodyHtml += `<div class="output-line">${formatRichText(line)}</div>`;
      }
      div.innerHTML = `
        <div class="output-panel-header">${escapeHtml(title)}</div>
        <div class="output-panel-body">${bodyHtml}</div>
      `;
    }

    chatContainer.appendChild(div);
    scrollToBottom();
  }

  function addThinking() {
    isProcessing = true;
    // Prevent duplicate thinking indicators
    if (document.getElementById('thinking-indicator')) return;
    const div = document.createElement('div');
    div.className = 'thinking';
    div.id = 'thinking-indicator';
    div.innerHTML = `
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span>Nexus is thinking...</span>
      <button id="stop-btn" class="stop-btn" title="Stop execution">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
        </svg>
        <span>Stop</span>
      </button>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();

    const stopBtn = div.querySelector('#stop-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        stopBtn.disabled = true;
        const textSpan = stopBtn.querySelector('span');
        if (textSpan) textSpan.textContent = 'Stopping...';
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stop' }));
        }
      });
    }
  }

  function removeThinking() {
    isProcessing = false;
    const thinking = document.getElementById('thinking-indicator');
    if (thinking) thinking.remove();
  }

  // ── Message Handler from Extension ────────────────────

  window.addEventListener('message', (event) => {
    const data = event.data;

    switch (data.type) {
      case 'init':
        switchMode(data.mode || 'command');
        updateServerStatus(data.serverRunning);
        if (data.serverUrl) {
          initWebSocket(data.serverUrl);
        }
        break;

      case 'thinking':
        addThinking();
        break;

      case 'commandResult':
        addOutputPanel(data.title, data.output || []);
        break;

      case 'modeChanged':
        switchMode(data.mode);
        break;

      case 'serverStatus':
        updateServerStatus(data.running);
        if (data.running && ws && ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
          connectWebSocket();
        } else if (!data.running && ws) {
          try { ws.close(); } catch (e) {}
        }
        break;
    }
  });

  // ── Server Status ───────────────────────────────────────
  function updateServerStatus(running) {
    if (running) {
      serverStatus.className = 'server-status online';
      serverStatus.querySelector('.status-text').textContent = 'Connected';
    } else {
      serverStatus.className = 'server-status offline';
      serverStatus.querySelector('.status-text').textContent = 'Offline';
    }
  }

  // ── Utility Functions ─────────────────────────────────

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Render a rich terminal-style boxed panel.
   * Detects Jira ticket lines (e.g. "• [SCRUM-16] Title — (Status)")
   * and generic bullet lists, rendering them with proper styling.
   */
  function renderRichPanel(title, lines) {
    // Filter empty lines from top/bottom
    const nonEmpty = lines.filter(l => l.trim() !== '');
    if (nonEmpty.length === 0) {
      return `<div class="rich-panel">
        <div class="rich-panel-title">${escapeHtml(title)}</div>
        <div class="rich-panel-empty">No results found.</div>
      </div>`;
    }

    // Try to match Jira-style: • [TICKET-ID] Title — (Status)
    const jiraPattern = /[•*]?\s*\[?([A-Z]+-\d+)\]?\s+(.+?)(?:\s+[—–-]+\s+\((.+?)\))?\s*$/;
    let itemsHtml = '';

    for (const line of nonEmpty) {
      const jiraMatch = line.match(jiraPattern);
      if (jiraMatch) {
        const [, ticketId, summary, status] = jiraMatch;
        const statusKey = (status || '').toLowerCase();
        let statusClass = 'todo';
        if (/in.prog|in.dev|progress|started|doing/i.test(statusKey)) statusClass = 'in-progress';
        else if (/done|closed|resolved|complete|finish/i.test(statusKey)) statusClass = 'done';

        itemsHtml += `
          <div class="rich-panel-item">
            <span class="rich-panel-item-bullet">•</span>
            <span class="rich-panel-item-id">${escapeHtml(ticketId)}</span>
            <span class="rich-panel-item-text">${formatRichText(summary.trim())}</span>
            ${status ? `<span class="rich-panel-item-status ${statusClass}">${escapeHtml(status.trim())}</span>` : ''}
          </div>`;
      } else {
        // Generic line — strip leading bullet if present, render as item
        const stripped = line.replace(/^[•*▪▸→\-]\s+/, '').trim();
        if (stripped) {
          itemsHtml += `
            <div class="rich-panel-item">
              <span class="rich-panel-item-bullet">•</span>
              <span class="rich-panel-item-text">${formatRichText(stripped)}</span>
            </div>`;
        }
      }
    }

    return `<div class="rich-panel">
      <div class="rich-panel-title">${escapeHtml(title)}</div>
      <div class="rich-panel-body">${itemsHtml}</div>
    </div>`;
  }

  /**
   * Convert Rich markup (e.g. [bold green]text[/]) to simple HTML.
   * This is a lightweight converter — it handles the most common Rich tags.
   */
  function formatRichText(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Strip Rich markup tags and apply basic formatting
    // [bold cyan]...[/] → <span class="text-cyan text-bold">...</span>
    html = html.replace(/\[bold\s+(green|red|yellow|blue|cyan|magenta|white)\](.*?)\[\/\]/g,
      (_, color, content) => `<span class="text-${color} text-bold">${content}</span>`);

    // [bold]...[/]
    html = html.replace(/\[bold\](.*?)\[\/\]/g, '<span class="text-bold">$1</span>');

    // [dim]...[/]
    html = html.replace(/\[dim(?:\s+italic)?\](.*?)\[\/\]/g, '<span class="text-dim">$1</span>');

    // [green]...[/] etc.
    html = html.replace(/\[(green|red|yellow|blue|cyan|magenta|white)\](.*?)\[\/\]/g,
      (_, color, content) => `<span class="text-${color}">${content}</span>`);

    // ✓ / ✗ icons
    html = html.replace(/✓/g, '<span class="text-green">✓</span>');
    html = html.replace(/✗/g, '<span class="text-red">✗</span>');

    // Bold **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Inline code `text`
    html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,255,136,0.08);padding:1px 4px;border-radius:3px;font-family:var(--font-mono);font-size:11px;">$1</code>');

    // Clean up any remaining [bold dodger_blue2] style tags
    html = html.replace(/\[(?:bold\s+)?[a-z_0-9]+\]/g, '');
    html = html.replace(/\[\/\]/g, '');

    // Convert newlines
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
})();
