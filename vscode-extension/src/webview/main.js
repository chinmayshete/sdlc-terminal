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
  const quickActions = document.getElementById('quick-actions');

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

  // ── Quick Actions ───────────────────────────────────────
  document.querySelectorAll('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const command = btn.getAttribute('data-command');
      if (command) {
        vscode.postMessage({ type: 'command', input: command, mode: currentMode });
        addUserMessage(command);
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
  function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || isProcessing) return;

    // Remove welcome message if still shown
    const welcome = chatContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    addUserMessage(message);
    chatInput.value = '';
    chatInput.style.height = 'auto';

    vscode.postMessage({ type: 'chat', message, mode: currentMode });
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

  function addOutputPanel(title, output) {
    removeThinking();

    const div = document.createElement('div');
    div.className = 'output-panel';

    let bodyHtml = '';
    for (const line of output) {
      bodyHtml += `<div class="output-line">${formatRichText(line)}</div>`;
    }

    div.innerHTML = `
      <div class="output-panel-header">${escapeHtml(title)}</div>
      <div class="output-panel-body">${bodyHtml}</div>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
  }

  function addThinking() {
    isProcessing = true;
    const div = document.createElement('div');
    div.className = 'thinking';
    div.id = 'thinking-indicator';
    div.innerHTML = `
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span>Nexus is thinking...</span>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
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
        break;

      case 'thinking':
        addThinking();
        break;

      case 'chatResponse':
        addAssistantMessage(data.message, data.changes, data.isError);
        break;

      case 'commandResult':
        addOutputPanel(data.title, data.output || []);
        break;

      case 'modeChanged':
        switchMode(data.mode);
        break;

      case 'serverStatus':
        updateServerStatus(data.running);
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
