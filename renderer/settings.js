const $ = id => document.getElementById(id);

// ===== Tab 页切换 =====
const tabItems = document.querySelectorAll('.tab-item');
const tabPanels = {
  1: $('tab-panel-1'),
  2: $('tab-panel-2'),
  3: $('tab-panel-3'),
};
tabItems.forEach(item => {
  item.addEventListener('click', () => {
    tabItems.forEach(t => t.classList.remove('active'));
    item.classList.add('active');
    Object.values(tabPanels).forEach(p => p?.classList.remove('active'));
    const panel = tabPanels[parseInt(item.dataset.tab)];
    if (panel) panel.classList.add('active');
  });
});

const previewImg = $('preview-img');
const previewEmpty = $('preview-empty');
const sizeSlider = $('size-slider');
const sizeVal = $('size-val');
const aiUrl = $('ai-url');
const aiKey = $('ai-key');
const aiModel = $('ai-model');
const aiPrompt = $('ai-prompt');
const btnSaveAi = $('btn-save-ai');
const btnToggleKey = $('btn-toggle-key');
const aiStatus = $('ai-status');
const btnLock = $('btn-lock');
const btnQuit = $('btn-quit');
const themeBtns = document.querySelectorAll('.theme-btn');
const cpInputBg = $('cp-input-bg');
const cpInputText = $('cp-input-text');
const cpSendBg = $('cp-send-bg');
const cpSendText = $('cp-send-text');

const colorPickers = [cpInputBg, cpInputText, cpSendBg, cpSendText];

// ===== 主题预设 =====
const themes = {
  default: { inputBg: '#2a2a3e', inputText: '#e0d8d0', sendBg: '#4fc3f7', sendText: '#1a1a2e' },
  ocean:   { inputBg: '#1a237e', inputText: '#e3f2fd', sendBg: '#42a5f5', sendText: '#ffffff' },
  warm:    { inputBg: '#3e2723', inputText: '#fbe9e7', sendBg: '#ff7043', sendText: '#ffffff' },
  dark:    { inputBg: '#1a1a2e', inputText: '#bdbdbd', sendBg: '#6c5ce7', sendText: '#ffffff' },
};

function setColorPickers(colors) {
  cpInputBg.value = colors.inputBg || '#2a2a3e';
  cpInputText.value = colors.inputText || '#e0d8d0';
  cpSendBg.value = colors.sendBg || '#4fc3f7';
  cpSendText.value = colors.sendText || '#1a1a2e';
}

function getColorPickers() {
  return {
    inputBg: cpInputBg.value,
    inputText: cpInputText.value,
    sendBg: cpSendBg.value,
    sendText: cpSendText.value,
  };
}

function sendColors(colors) {
  window.petAPI.setConfig({ colors });
}

// ===== 加载图片预览 =====
async function loadPreview() {
  const data = await window.petAPI.getImage();
  if (data) {
    previewImg.src = data;
    previewImg.style.display = 'block';
    previewEmpty.style.display = 'none';
  } else {
    previewImg.style.display = 'none';
    previewEmpty.style.display = 'block';
  }
}

// ===== 大小 =====
async function loadSize() {
  const cfg = await window.petAPI.getConfig();
  const s = cfg.size || 100;
  sizeSlider.value = s;
  sizeVal.textContent = `${s}%`;
}
sizeSlider.addEventListener('input', () => {
  const v = parseInt(sizeSlider.value);
  sizeVal.textContent = `${v}%`;
  window.petAPI.setConfig({ size: v });
});

// ===== 锁定 =====
async function loadLock() {
  const cfg = await window.petAPI.getConfig();
  const locked = cfg.locked !== false;
  btnLock.classList.toggle('active', locked);
  btnLock.textContent = locked ? '🔒 已锁定' : '🔓 未锁定';
}
btnLock.addEventListener('click', async () => {
  const locked = !btnLock.classList.contains('active');
  await window.petAPI.setConfig({ locked });
  btnLock.classList.toggle('active', locked);
  btnLock.textContent = locked ? '🔒 已锁定' : '🔓 未锁定';
});

// ===== 换色 =====
async function loadColors() {
  const cfg = await window.petAPI.getConfig();
  const colors = cfg.colors;
  if (colors) setColorPickers(colors);
  const theme = cfg.theme || 'default';
  themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}

colorPickers.forEach(p => {
  p.addEventListener('input', () => {
    sendColors(getColorPickers());
    themeBtns.forEach(b => b.classList.remove('active'));
  });
});

themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const colors = themes[btn.dataset.theme] || themes.default;
    setColorPickers(colors);
    sendColors(colors);
    themeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ===== AI 配置 =====
async function loadAI() {
  const cfg = await window.petAPI.getAIConfig();
  aiUrl.value = cfg.apiUrl || '';
  aiKey.value = cfg.apiKey || '';
  aiModel.value = cfg.model || '';
  aiPrompt.value = cfg.systemPrompt || '';
}

btnSaveAi.addEventListener('click', async () => {
  const res = await window.petAPI.setAIConfig({
    apiUrl: aiUrl.value.trim(),
    apiKey: aiKey.value.trim(),
    model: aiModel.value.trim(),
    systemPrompt: aiPrompt.value.trim(),
  });
  aiStatus.textContent = res.success ? '✅ 已保存' : '❌ 保存失败';
  setTimeout(() => { aiStatus.textContent = ''; }, 2000);
});

btnToggleKey.addEventListener('click', () => {
  aiKey.type = aiKey.type === 'password' ? 'text' : 'password';
});

// ===== 桌宠切换 =====
const petGrid = document.getElementById('pet-grid');
let currentPet = null;

async function loadPetList() {
  const cfg = await window.petAPI.getConfig();
  currentPet = cfg.pet || 'pet-default';
  const list = await window.petAPI.getPetList();
  petGrid.innerHTML = '';
  await Promise.all(list.map(async name => {
    const wrap = document.createElement('div');
    wrap.className = 'pet-card-wrap';
    const card = document.createElement('div');
    card.className = 'pet-card' + (name === currentPet ? ' active' : '');
    const img = document.createElement('img');
    img.className = 'pet-card-img';
    const data = await window.petAPI.getImage(name);
    img.src = data || '';
    img.alt = name;
    const label = document.createElement('span');
    label.className = 'pet-card-name';
    let dName = name;
    if (name === 'pet-default') dName = '🐱 预设';
    else dName = dName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    label.textContent = dName;
    card.appendChild(img);
    card.appendChild(label);
    card.addEventListener('click', async () => {
      if (name === currentPet) return;
      await window.petAPI.setConfig({ pet: name });
      document.querySelectorAll('.pet-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentPet = name;
      const preview = await window.petAPI.getImage(name);
      if (preview) {
        previewImg.src = preview;
        previewImg.style.display = 'block';
        previewEmpty.style.display = 'none';
      }
    });
    // 删除按钮（默认桌宠不可删）
    if (name !== 'pet-default') {
      const delBtn = document.createElement('button');
      delBtn.className = 'pet-del-btn';
      delBtn.textContent = '\u00d7';
      delBtn.title = '删除此桌宠';
      delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('确定删除桌宠 "' + dName + '"？文件夹和图片都会被删除。')) return;
        const res = await window.petAPI.deletePet(name);
        if (res.success) {
          if (name === currentPet) {
            currentPet = 'pet-default';
            loadPreview();
          }
          loadPetList();
        } else {
          alert('删除失败: ' + res.error);
        }
      });
      wrap.appendChild(delBtn);
    }
    wrap.appendChild(card);
    petGrid.appendChild(wrap);
  }));
}

// ===== 命名弹窗（替代被禁用的 prompt()）=====
const nameModal = $('name-modal');
const nameInput = $('name-input');
const nameConfirm = $('name-confirm');
const nameCancel = $('name-cancel');
let nameResolve = null;

function showNameDialog() {
  nameModal.classList.remove('hidden');
  nameInput.value = '';
  setTimeout(() => nameInput.focus(), 50);
  return new Promise(resolve => { nameResolve = resolve; });
}
nameConfirm.addEventListener('click', () => {
  const val = nameInput.value.trim();
  nameModal.classList.add('hidden');
  if (nameResolve) nameResolve(val || null);
});
nameCancel.addEventListener('click', () => {
  nameModal.classList.add('hidden');
  if (nameResolve) nameResolve(null);
});
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') nameConfirm.click();
  if (e.key === 'Escape') nameCancel.click();
});

// 添加桌宠按钮
document.getElementById('btn-add-pet')?.addEventListener('click', async () => {
  const name = await showNameDialog();
  if (!name) return;
  const res = await window.petAPI.pickAndAddPet(name);
  if (res.success) {
    await loadPetList();
    const newCfg = await window.petAPI.getConfig();
    currentPet = newCfg.pet || 'pet-default';
  } else if (res.error !== '已取消') {
    alert('添加失败: ' + res.error);
  }
});

// ===== 退出 =====
btnQuit.addEventListener('click', () => {
  if (confirm('确定退出？')) window.petAPI.quitApp();
});

// ===== 对话记录 =====
const settingsHistory = $('settings-history');
async function loadSettingsHistory() {
  try {
    console.log('[settings] loadSettingsHistory called');
    const history = await window.petAPI.getHistory();
    console.log('[settings] getHistory returned:', JSON.stringify(history).slice(0, 500));
    settingsHistory.innerHTML = '';
    if (!history || history.length === 0) {
      settingsHistory.innerHTML = '<div style="padding:8px;background:#fff3e0;border-radius:6px;font-size:11px;color:#7a4a2e">⚠️ 历史为空</div>';
      return;
    }
    settingsHistory.innerHTML = `<div style="font-size:10px;color:#a67c5a;text-align:center;padding:2px 0">共 ${history.length} 条</div>`;
    history.slice().reverse().forEach(entry => {
      const item = document.createElement('div');
      item.className = 'h-item';
      const t = new Date(entry.time);
      const ts = t.toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      item.innerHTML =
        '<div class="h-time">' + ts + '</div>' +
        '<div class="h-user"><b>你:</b> ' + escapeHtml(entry.user) + '</div>' +
        '<div class="h-ai"><b>AI:</b> ' + escapeHtml(entry.ai) + '</div>';
      settingsHistory.appendChild(item);
    });
  } catch (e) {
    console.error('[settings] loadSettingsHistory error:', e);
    settingsHistory.innerHTML = '<div style="padding:8px;background:#ffebee;border-radius:6px;font-size:11px;color:#c62828">❌ 错误: ' + escapeHtml(e.message) + '</div>';
  }
}
function escapeHtml(t) {
  const el = document.createElement('div');
  el.textContent = t;
  return el.innerHTML;
}

// ===== 启动 =====
loadPreview();
loadSize();
loadLock();
loadColors();
loadAI();
loadSettingsHistory();
loadPetList();

document.getElementById('btn-refresh-history')?.addEventListener('click', loadSettingsHistory);

// ===== 闹钟 =====
const alarmList = document.getElementById('alarm-list');
const alarmCount = document.getElementById('alarm-count');
const btnAddAlarm = document.getElementById('btn-add-alarm');
const alarmModal = document.getElementById('alarm-modal');
const alarmTimeInput = document.getElementById('alarm-time-input');
const alarmLabelInput = document.getElementById('alarm-label-input');
const alarmRepeatSelect = document.getElementById('alarm-repeat-select');
const alarmDaysPicker = document.getElementById('alarm-days-picker');
const alarmEditId = document.getElementById('alarm-edit-id');
const alarmModalTitle = document.getElementById('alarm-modal-title');
const alarmRingtoneSelect = document.getElementById('alarm-ringtone-select');

const REPEAT_LABELS = {
  once: '仅一次', daily: '每天', weekday: '工作日',
  weekend: '周末', custom: '自定义',
};

let alarms = [];

function getDaysText(a) {
  if (a.repeat === 'once') return '仅一次';
  if (a.repeat === 'daily') return '每天';
  if (a.repeat === 'weekday') return '周一至周五';
  if (a.repeat === 'weekend') return '周末';
  if (a.repeat === 'custom' && a.days) {
    const names = ['日','一','二','三','四','五','六'];
    return a.days.map(d => '周' + names[d]).join('、') || '自定义';
  }
  return '';
}

async function loadAlarms() {
  alarms = await window.petAPI.getAlarms();
  alarmCount.textContent = alarms.length + '/10';
  alarmList.innerHTML = '';
  alarms.forEach(a => {
    const item = document.createElement('div');
    item.className = 'alarm-item';
    const labelText = a.label || '';
    const timeStr = String(a.hour).padStart(2,'0') + ':' + String(a.minute).padStart(2,'0');
    item.innerHTML =
      '<div class="alarm-left">' +
        '<span class="alarm-time">' + timeStr + '</span>' +
        (labelText ? '<span class="alarm-label">' + escapeHtml(labelText) + '</span>' : '') +
        '<span class="alarm-repeat">' + getDaysText(a) + '</span>' +
      '</div>' +
      '<div class="alarm-right">' +
        '<label class="alarm-toggle">' +
          '<input type="checkbox" ' + (a.enabled ? 'checked' : '') + '>' +
          '<span class="alarm-toggle-slider"></span>' +
        '</label>' +
        '<button class="alarm-del-btn" title="删除">\u00d7</button>' +
      '</div>';
    // 开关
    const toggle = item.querySelector('input[type=checkbox]');
    toggle.addEventListener('change', async () => {
      await window.petAPI.toggleAlarm(a.id, toggle.checked);
    });
    // 删除
    const del = item.querySelector('.alarm-del-btn');
    del.addEventListener('click', async () => {
      if (!confirm('确定删除 ' + timeStr + ' 的闹钟？')) return;
      await window.petAPI.deleteAlarm(a.id);
      loadAlarms();
    });
    alarmList.appendChild(item);
  });
}

// 天数选择器
const dayBtns = document.querySelectorAll('.day-btn');
let selectedDays = [];
dayBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const d = parseInt(btn.dataset.d);
    if (selectedDays.includes(d)) {
      selectedDays = selectedDays.filter(x => x !== d);
      btn.classList.remove('active');
    } else {
      selectedDays.push(d);
      btn.classList.add('active');
    }
  });
});

alarmRepeatSelect.addEventListener('change', () => {
  alarmDaysPicker.classList.toggle('hidden', alarmRepeatSelect.value !== 'custom');
});

// 添加 / 编辑闹钟
btnAddAlarm.addEventListener('click', () => {
  alarmModalTitle.textContent = '⏰ 添加闹钟';
  alarmEditId.value = '';
  alarmTimeInput.value = '08:00';
  alarmLabelInput.value = '';
  alarmRepeatSelect.value = 'daily';
  renderRingtoneSelect();
  alarmRingtoneSelect.value = 'default';
  alarmDaysPicker.classList.add('hidden');
  selectedDays = [];
  dayBtns.forEach(b => b.classList.remove('active'));
  // 默认选工作日
  selectedDays = [1,2,3,4,5];
  dayBtns.forEach(b => {
    if (selectedDays.includes(parseInt(b.dataset.d))) b.classList.add('active');
  });
  alarmModal.classList.remove('hidden');
});

document.getElementById('alarm-modal-confirm').addEventListener('click', async () => {
  const timeVal = alarmTimeInput.value;
  if (!timeVal) return;
  const [h, m] = timeVal.split(':').map(Number);
  const repeat = alarmRepeatSelect.value;
  const alarm = {
    hour: h, minute: m,
    label: alarmLabelInput.value.trim(),
    repeat: repeat,
    enabled: true,
    ringtone: alarmRingtoneSelect.value,
  };
  if (repeat === 'custom') {
    alarm.days = [...selectedDays];
  }
  await window.petAPI.addAlarm(alarm);
  alarmModal.classList.add('hidden');
  loadAlarms();
});

document.getElementById('alarm-modal-cancel').addEventListener('click', () => {
  alarmModal.classList.add('hidden');
});

// 接收闹钟提醒 - 刷新列表（比如仅一次的自动禁用后更新界面）
if (window.petAPI.onAlarmRing) {
  window.petAPI.onAlarmRing(data => {
    console.log('[alarm]', data.label, data.time);
    loadAlarms();
  });
}

// 启动
loadAlarms();

// ===== 铃声管理 =====
const ringtoneListEl = document.getElementById('ringtone-list');
const ringtoneCountEl = document.getElementById('ringtone-count');
const btnAddRingtone = document.getElementById('btn-add-ringtone');

let ringtones = [];

async function loadRingtones() {
  ringtones = await window.petAPI.getRingtones();
  const customCount = ringtones.filter(r => !r.builtin).length;
  ringtoneCountEl.textContent = customCount + '/10';
  renderRingtoneList();
  renderRingtoneSelect();
}

function renderRingtoneList() {
  ringtoneListEl.innerHTML = '';
  ringtones.forEach(r => {
    const item = document.createElement('div');
    item.className = 'ringtone-item' + (r.builtin ? '' : ' ringtone-deletable');
    const tag = r.id === 'default' ? ' <span class="ringtone-tag">默认</span>'
      : r.id === 'silent' ? ' <span class="ringtone-tag">内置</span>'
      : ' <span class="ringtone-tag">自定义</span>';
    item.innerHTML = '<span class="ringtone-name">' + escapeHtml(r.name) + '</span>' + tag;
    if (!r.builtin) {
      item.title = '右键删除';
      item.addEventListener('contextmenu', async e => {
        e.preventDefault();
        if (!confirm('确定删除铃声 "' + r.name + '"？')) return;
        const res = await window.petAPI.deleteRingtone(r.id);
        if (res.success) {
          loadRingtones();
        } else {
          alert('删除失败: ' + res.error);
        }
      });
    }
    ringtoneListEl.appendChild(item);
  });
}

function renderRingtoneSelect() {
  const sel = document.getElementById('alarm-ringtone-select');
  const prev = sel.value;
  sel.innerHTML = '';
  ringtones.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

btnAddRingtone.addEventListener('click', async () => {
  const res = await window.petAPI.pickAndAddRingtone();
  if (res.success) {
    await loadRingtones();
    // 新添加的铃声默认在弹窗里被选中
    alarmRingtoneSelect.value = res.ringtone.id;
  } else if (res.error !== '已取消') {
    alert(res.error);
  }
});

// 加载铃声
loadRingtones();