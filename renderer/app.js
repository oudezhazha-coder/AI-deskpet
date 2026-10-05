const petImg = document.getElementById('pet-image');
const petArea = document.getElementById('pet-area');
const lockOverlay = document.getElementById('lock-overlay');
const ctxMenu = document.getElementById('ctx-menu');
const ctxItems = document.querySelectorAll('.ctx-item[data-anim]');
const ctxLock = document.getElementById('ctx-lock');
const ctxChat = document.getElementById('ctx-chat');
const ctxSettings = document.getElementById('ctx-settings');
const ctxHistory = document.getElementById('ctx-history');
const inputBar = document.getElementById('input-bar');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const historyClose = document.getElementById('history-close');
const chatMenu = document.getElementById('chat-menu');

let cfg = { size: 100, locked: true, anim: 'normal' };
let chatting = false;
let bubbleTimer = null;
let msgHistory = [];

// ===== 工具 =====
function escapeHtml(t) {
  const el = document.createElement('div');
  el.textContent = t;
  return el.innerHTML;
}

// ===== 缩放 =====
function applySize(pct) {
  const s = (pct || 100) / 100;
  const base = 170;
  const sz = Math.round(base * s);
  petArea.style.width = sz + 'px';
  petArea.style.height = sz + 'px';
}

// ===== 主题配色 =====
const themes = {
  default: { inputBg: '#2a2a3e', inputText: '#e0d8d0', sendBg: '#4fc3f7', sendText: '#1a1a2e' },
  ocean:   { inputBg: '#1a237e', inputText: '#e3f2fd', sendBg: '#42a5f5', sendText: '#ffffff' },
  warm:    { inputBg: '#3e2723', inputText: '#fbe9e7', sendBg: '#ff7043', sendText: '#ffffff' },
  dark:    { inputBg: '#1a1a2e', inputText: '#bdbdbd', sendBg: '#6c5ce7', sendText: '#ffffff' },
};

function applyTheme(colors) {
  if (!colors) colors = themes.default;
  chatInput.style.background = colors.inputBg;
  chatInput.style.color = colors.inputText;
  chatSend.style.background = colors.sendBg;
  chatSend.style.color = colors.sendText;
}

// ===== 加载图片 =====
async function loadImage() {
  try {
    const data = await window.petAPI.getImage();
    if (data) {
      petImg.src = data;
      petImg.style.display = 'block';
    }
  } catch (e) {
    console.error('loadImage error:', e);
  }
}

// ===== 配置 =====
async function loadConfig() {
  cfg = await window.petAPI.getConfig();
  lockOverlay.classList.toggle('visible', cfg.locked !== false);
  updateLockLabel();
  ctxItems.forEach(el => el.classList.toggle('active', el.dataset.anim === (cfg.anim || 'normal')));
  applySize(cfg.size || 100);
  applyTheme(cfg.colors || themes.default);
}

// ===== 动画 =====
function setAnim(level) {
  cfg.anim = level;
  window.petAPI.setConfig({ anim: level });
  ctxItems.forEach(el => el.classList.toggle('active', el.dataset.anim === level));
  ctxMenu.classList.add('hidden');
}

function bouncePet() {
  if (!cfg.anim || cfg.anim === 'none' || !petImg.src) return;
  petImg.classList.remove('bounce-n', 'bounce-l');
  void petImg.offsetWidth;
  petImg.classList.add(cfg.anim === 'normal' ? 'bounce-n' : 'bounce-l');
}

function updateLockLabel() {
  ctxLock.textContent = (cfg.locked !== false) ? '🔒 锁定' : '🔓 解锁';
}

// ===== 悬停显示输入栏 =====
let hoverTimer = null;

function showInput() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  inputBar.classList.remove('hidden');
}
function hideInput() {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (chatInput === document.activeElement) return;
    inputBar.classList.add('hidden');
  }, 600);
}

document.addEventListener('mousemove', e => {
  const rect = document.body.getBoundingClientRect();
  const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                 e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (inside) showInput();
  else hideInput();
});

// ===== 发送消息 =====
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || chatting) return;

  chatInput.value = '';
  inputBar.classList.add('hidden');
  chatting = true;

  msgHistory.push({ role: 'user', content: text });

  try {
    const res = await window.petAPI.chat({ messages: msgHistory.slice(-12) });
    if (!res || !res.success) {
      throw new Error(res?.error || '未知错误');
    }
    const aiMsg = res.reply || '…';
    msgHistory.push({ role: 'assistant', content: aiMsg });

    bubbleText.textContent = aiMsg;
    bubble.classList.remove('hidden');
    bouncePet();
    chatting = false;

    window.petAPI.appendHistory({
      user: text,
      ai: aiMsg,
      time: new Date().toISOString(),
    });

    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.classList.add('hidden');
      bubbleTimer = null;
    }, 60000);
  } catch (e) {
    bubbleText.textContent = '❌ ' + (e.message || '回复失败，请检查 AI 配置');
    bubble.classList.remove('hidden');
    chatting = false;
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.classList.add('hidden');
      bubbleTimer = null;
    }, 4000);
  }
}

chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

chatInput.addEventListener('focus', () => {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
});
chatInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!inputBar.classList.contains('hidden') && !chatting &&
        !chatInput.value.trim()) {
      hideInput();
    }
  }, 200);
});

// ===== 对话历史面板 =====
async function showHistoryPanel() {
  const history = await window.petAPI.getHistory();
  historyList.innerHTML = '';
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">暂无对话记录</div>';
  } else {
    history.slice().reverse().forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const t = new Date(entry.time);
      const ts = t.toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      item.innerHTML =
        '<div class="history-time">' + ts + '</div>' +
        '<div class="history-msg"><b>你:</b> ' + escapeHtml(entry.user) + '</div>' +
        '<div class="history-msg"><b>AI:</b> ' + escapeHtml(entry.ai) + '</div>';
      historyList.appendChild(item);
    });
  }
  historyPanel.classList.remove('hidden');
  ctxMenu.classList.add('hidden');
}

function closeHistoryPanel() {
  historyPanel.classList.add('hidden');
}

historyClose.addEventListener('click', closeHistoryPanel);
historyPanel.addEventListener('click', e => {
  if (e.target === historyPanel) closeHistoryPanel();
});

// ===== 菜单按钮（输入栏内 ⋮）=====
chatMenu.addEventListener('click', () => {
  ctxMenu.classList.remove('hidden');
  requestAnimationFrame(() => {
    const btnRect = chatMenu.getBoundingClientRect();
    const mRect = ctxMenu.getBoundingClientRect();
    let left = btnRect.right - mRect.width;
    let top = btnRect.top - mRect.height - 4;
    if (left < 4) left = 4;
    if (top < 4) top = 4;
    if (left + mRect.width > window.innerWidth) left = window.innerWidth - mRect.width - 4;
    if (top + mRect.height > window.innerHeight) top = window.innerHeight - mRect.height - 4;
    ctxMenu.style.left = left + 'px';
    ctxMenu.style.top = top + 'px';
  });
});

// ===== 点击菜单外关闭 =====
document.addEventListener('mousedown', e => {
  if (!ctxMenu.contains(e.target) && !historyPanel.contains(e.target)) {
    ctxMenu.classList.add('hidden');
  }
});

ctxItems.forEach(el => el.addEventListener('click', () => setAnim(el.dataset.anim)));
ctxLock.addEventListener('click', () => {
  ctxMenu.classList.add('hidden');
  const locked = !(cfg.locked !== false);
  window.petAPI.setConfig({ locked });
});
ctxChat.addEventListener('click', () => {
  ctxMenu.classList.add('hidden');
  showInput();
  setTimeout(() => chatInput.focus(), 100);
});
ctxHistory.addEventListener('click', () => {
  ctxMenu.classList.add('hidden');
  showHistoryPanel();
});
ctxSettings.addEventListener('click', () => {
  ctxMenu.classList.add('hidden');
  window.petAPI.openSettings();
});

// ===== 配置变动同步 =====
window.petAPI.onConfigChanged(c => {
  cfg = { ...cfg, ...c };
  lockOverlay.classList.toggle('visible', cfg.locked !== false);
  updateLockLabel();
  ctxItems.forEach(el => el.classList.toggle('active', el.dataset.anim === (cfg.anim || 'normal')));
  if (c.size) applySize(c.size);
  if (c.colors) applyTheme(c.colors);
});

// ===== 启动 =====
loadConfig();
loadImage();