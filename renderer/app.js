const petImg = document.getElementById('pet-image');
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

// ===== 加载图片 =====
async function loadImage() {
  console.log('loadImage called');
  try {
    const data = await window.petAPI.getImage();
    console.log('got image data?', !!data);
    if (data) {
      petImg.src = data;
      petImg.style.display = 'block';
      console.log('src set');
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
  if (chatting) return;
  if (!bubble.classList.contains('hidden')) return;
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
    const res = await window.petAPI.chat({ messages: msgHistory });
    if (!res || !res.success) {
      throw new Error(res?.error || '未知错误');
    }
    const aiMsg = res.reply || '…';
    msgHistory.push({ role: 'assistant', content: aiMsg });

    bubbleText.textContent = aiMsg;
    bubble.classList.remove('hidden');
    bouncePet();

    // 保存到持久对话历史（最多 10 条）
    window.petAPI.appendHistory({
      user: text,
      ai: aiMsg,
      time: new Date().toISOString(),
    });

    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.classList.add('hidden');
      bubbleTimer = null;
      chatting = false;
    }, 60000);
  } catch (e) {
    bubbleText.textContent = '❌ ' + (e.message || '回复失败，请检查 AI 配置');
    bubble.classList.remove('hidden');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.classList.add('hidden');
      bubbleTimer = null;
      chatting = false;
    }, 4000);
  }
}

chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// 焦点控制
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

// ===== 右键菜单 =====
window.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mousedown', e => {
  if (e.button === 2) {
    e.preventDefault();
    // 先显示才能测量实际尺寸
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.classList.remove('hidden');
    // 测量后修正，确保不超出视口
    const rect = ctxMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ctxMenu.style.left = Math.max(0, window.innerWidth - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      ctxMenu.style.top = Math.max(0, window.innerHeight - rect.height) + 'px';
    }
  } else if (!ctxMenu.contains(e.target) && !historyPanel.contains(e.target)) {
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
ctxHistory.addEventListener('click', showHistoryPanel);
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
});

// ===== 启动 =====
loadConfig();
loadImage();