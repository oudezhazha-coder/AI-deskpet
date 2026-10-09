const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// ===== 数据路径 =====
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');
const aiConfigPath = path.join(userDataPath, 'ai-config.json');

let petWin = null;
let settingsWin = null;
let tray = null;

// ===== 工具 =====
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJSON(p, def) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : def; }
  catch { return def; }
}
function writeJSON(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ===== 桌宠配置 =====
function getConfig() {
  return readJSON(configPath, { size: 100, locked: true, anim: 'normal', pet: 'pet-default' });
}
function saveConfig(cfg) {
  writeJSON(configPath, cfg);
}

// ===== AI 配置 =====
function getDefaultAIConfig() {
  return {
    apiUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    systemPrompt: '你是一个可爱的桌面宠物精灵，请用简短、温暖、可爱的话回答。',
  };
}
function getAIConfig() {
  const cfg = readJSON(aiConfigPath, null);
  return cfg || getDefaultAIConfig();
}
function saveAIConfig(cfg) {
  const clean = {};
  for (const k of ['apiUrl', 'apiKey', 'model', 'systemPrompt']) {
    if (cfg[k] !== undefined) clean[k] = cfg[k];
  }
  writeJSON(aiConfigPath, clean);
}

// ===== 对话历史（最多 10 条）=====
const historyPath = path.join(userDataPath, 'chat-history.json');
function getChatHistory() {
  return readJSON(historyPath, []);
}
function saveChatHistory(arr) {
  const trimmed = arr.slice(-10);
  writeJSON(historyPath, trimmed);
  return trimmed;
}

// ===== 创建桌宠窗口 =====
function createPetWindow() {
  if (petWin && !petWin.isDestroyed()) { petWin.focus(); return; }

  petWin = new BrowserWindow({
    width: 260, height: 380,
    frame: false, transparent: true,
    resizable: true, alwaysOnTop: true, skipTaskbar: false, hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  petWin.webContents.openDevTools();
  petWin.on('closed', () => { petWin = null; });
}

// ===== 创建设置窗口 =====
function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }

  const { screen } = require('electron');
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { width: sw, height: sh } = display.workArea;

  settingsWin = new BrowserWindow({
    width: 580, height: 620,
    resizable: true, minWidth: 480, minHeight: 500,
    title: 'AI 桌宠 - 设置',
    
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  const sx = Math.round((sw - 580) / 2);
  const sy = Math.round((sh - 620) / 2);
  settingsWin.setPosition(Math.max(sx, 0), Math.max(sy, 0));
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.webContents.openDevTools();
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ===== 系统托盘 =====
function createTray() {
  const ico = nativeImage.createEmpty();
  tray = new Tray(ico);
  tray.setToolTip('AI 桌宠 🐾');
  tray.on('click', () => openSettingsWindow());
  tray.on('right-click', () => {
    const cfg = getConfig();
    const menu = Menu.buildFromTemplate([
      {
        label: cfg.locked ? '🔓 解锁窗口' : '🔒 锁定窗口',
        click: () => {
          const c = getConfig(); c.locked = !c.locked; saveConfig(c);
          if (petWin && !petWin.isDestroyed()) petWin.webContents.send('config-changed', c);
          createTray();
        },
      },
      { type: 'separator' },
      { label: '⚙️ 设置', click: () => openSettingsWindow() },
      { type: 'separator' },
      { label: '❌ 退出', click: () => app.quit() },
    ]);
    tray.popUpContextMenu(menu);
  });
}

// ===== IPC =====

// 配置
ipcMain.handle('get-config', () => getConfig());
ipcMain.handle('set-config', (_e, cfg) => {
  const c = getConfig();
  if (cfg.size !== undefined) c.size = cfg.size;
  if (cfg.locked !== undefined) c.locked = cfg.locked;
  if (cfg.theme !== undefined) c.theme = cfg.theme;
  if (cfg.colors !== undefined) c.colors = cfg.colors;
  if (cfg.pet !== undefined) c.pet = cfg.pet;
  saveConfig(c);
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('config-changed', c);
  if (cfg.size && petWin && !petWin.isDestroyed()) {
    const s = cfg.size / 100;
    petWin.setSize(Math.round(260 * s), Math.round(380 * s));
  }
  return { success: true };
});

// ===== 桌宠图片工具 =====
const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
function petFolderPath(name) {
  return path.join(__dirname, 'resources', 'pets', name);
}
/** 返回桌宠文件夹里第一张找到的图片路径 */
function findFirstImage(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (IMG_EXTS.includes(path.extname(f).toLowerCase())) {
      return path.join(dir, f);
    }
  }
  return null;
}
/** 桌宠文件夹里所有图片文件名 */
function listImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => IMG_EXTS.includes(path.extname(f).toLowerCase()));
}

// 图片（支持指定桌宠，自动找第一张可用图）
ipcMain.handle('get-image', (_e, petName) => {
  const cfg = getConfig();
  const name = petName || cfg.pet || 'pet-default';
  const imgPath = findFirstImage(petFolderPath(name));
  if (imgPath) {
    const data = fs.readFileSync(imgPath);
    return `data:image/${path.extname(imgPath).slice(1)};base64,${data.toString('base64')}`;
  }
  // 向后兼容
  const oldPath = path.join(__dirname, 'resources', 'pet-default.png');
  if (fs.existsSync(oldPath)) {
    const data = fs.readFileSync(oldPath);
    return `data:image/png;base64,${data.toString('base64')}`;
  }
  return null;
});

// 列出可用桌宠（文件夹里有图片就算）
ipcMain.handle('get-pet-list', () => {
  const petsDir = path.join(__dirname, 'resources', 'pets');
  if (!fs.existsSync(petsDir)) return [];
  return fs.readdirSync(petsDir).filter(name => {
    return listImages(path.join(petsDir, name)).length > 0;
  });
});

// 添加桌宠（用户命名后选多图 → 建文件夹 → 全部复制）
ipcMain.handle('pick-and-add-pet', async (_e, petName) => {
  if (!petName || !petName.trim()) return { success: false, error: '名称不能为空' };
  const safeName = petName.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '').replace(/\s+/g, '-');
  if (!safeName) return { success: false, error: '名称无效，请用中文、英文或数字' };

  const win = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined;
  const result = await dialog.showOpenDialog(win, {
    title: `选择 ${petName} 的图片（可多选）`,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths.length) return { success: false, error: '已取消' };

  const petsDir = path.join(__dirname, 'resources', 'pets');
  if (!fs.existsSync(petsDir)) fs.mkdirSync(petsDir, { recursive: true });

  // 重名加序号
  let finalName = safeName;
  let counter = 1;
  while (fs.existsSync(path.join(petsDir, finalName))) {
    finalName = `${safeName}-${counter}`;
    counter++;
  }

  const destDir = path.join(petsDir, finalName);
  fs.mkdirSync(destDir, { recursive: true });

  let copied = 0;
  for (const srcPath of result.filePaths) {
    const ext = path.extname(srcPath).toLowerCase();
    if (!IMG_EXTS.includes(ext)) continue;
    const basename = path.basename(srcPath);
    fs.copyFileSync(srcPath, path.join(destDir, basename));
    copied++;
  }

  return { success: true, petName: finalName, copied };
});

// 删除桌宠
ipcMain.handle('delete-pet', (_e, petName) => {
  if (!petName || petName === 'pet-default') {
    return { success: false, error: '不能删除默认桌宠' };
  }
  const dir = petFolderPath(petName);
  if (!fs.existsSync(dir)) return { success: false, error: '桌宠不存在' };
  fs.rmSync(dir, { recursive: true, force: true });
  const cfg = getConfig();
  if (cfg.pet === petName) {
    cfg.pet = 'pet-default';
    saveConfig(cfg);
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send('config-changed', { pet: 'pet-default' });
  }
  return { success: true };
});

// AI
ipcMain.handle('get-ai-config', () => getAIConfig());
ipcMain.handle('set-ai-config', (_e, cfg) => {
  saveAIConfig(cfg);
  return { success: true };
});
ipcMain.handle('ai-chat', async (_e, payload) => {
  const cfg = getAIConfig();
  if (!cfg.apiKey) return { success: false, error: '请先配置 API 密钥' };
  if (!cfg.apiUrl) return { success: false, error: '请先配置 API 地址' };
  try {
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/chat/completions`;
    const msgList = payload?.messages || [{ role: 'user', content: String(payload) }];
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: cfg.systemPrompt || getDefaultAIConfig().systemPrompt },
          ...msgList,
        ],
        max_tokens: 500, temperature: 0.8,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { success: false, error: `API ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = await res.json();
    return { success: true, reply: (data.choices?.[0]?.message?.content || '').trim() };
  } catch (err) {
    return { success: false, error: `请求失败: ${err.message}` };
  }
});

// 闹钟
ipcMain.handle('get-alarms', () => getAlarms());
ipcMain.handle('save-alarms', (_e, alarms) => {
  saveAlarms(alarms);
  return { success: true };
});
ipcMain.handle('add-alarm', (_e, alarm) => {
  const alarms = getAlarms();
  if (alarms.length >= 10) return { success: false, error: '最多10个闹钟' };
  alarm.id = 'alarm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  alarm.enabled = alarm.enabled !== false;
  alarms.push(alarm);
  saveAlarms(alarms);
  return { success: true, alarms };
});
ipcMain.handle('delete-alarm', (_e, id) => {
  const alarms = getAlarms().filter(a => a.id !== id);
  saveAlarms(alarms);
  return { success: true, alarms };
});
ipcMain.handle('toggle-alarm', (_e, id, enabled) => {
  const alarms = getAlarms();
  const alarm = alarms.find(a => a.id === id);
  if (alarm) alarm.enabled = enabled;
  saveAlarms(alarms);
  return { success: true, alarms };
});

ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('open-settings', () => openSettingsWindow());

// 对话历史
ipcMain.handle('get-chat-history', () => {
  const data = getChatHistory();
  console.log('get-chat-history returning:', JSON.stringify(data).slice(0, 200));
  return data;
});
ipcMain.handle('append-chat-history', (_e, entry) => {
  const h = getChatHistory();
  h.push(entry);
  saveChatHistory(h);
  return { success: true };
});

// ===== 闹钟 =====
const alarmsPath = path.join(userDataPath, 'alarms.json');
let alarmTimer = null;
function getAlarms() {
  return readJSON(alarmsPath, []);
}
function saveAlarms(arr) {
  writeJSON(alarmsPath, arr);
}
function checkAlarms() {
  const alarms = getAlarms();
  if (!alarms.length) return;
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const today = now.getDay();
  const date = now.getDate();
  const timeStr = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  for (const a of alarms) {
    if (!a.enabled) continue;
    if (a.hour !== h || a.minute !== m) continue;
    if (a._lastTriggered === timeStr + String(date)) continue;
    const shouldRing = a.repeat === 'daily' || a.repeat === 'once'
      || (a.repeat === 'weekday' && today >= 1 && today <= 5)
      || (a.repeat === 'weekend' && (today === 0 || today === 6))
      || (a.repeat === 'custom' && a.days && a.days.includes(today));
    if (!shouldRing) continue;
    a._lastTriggered = timeStr + String(date);
    
    // 系统通知
    try {
      const notif = new Notification({ title: '⏰ ' + a.label || '闹钟', body: timeStr + ' 到点了！' });
      setTimeout(() => notif.close(), 8000);
    } catch(e) { /* 不支持系统通知就算了 */ }
    if (petWin && !petWin.isDestroyed()) {
      petWin.webContents.send('alarm-ring', { id: a.id, label: a.label || '闹钟', time: timeStr });
    }
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('alarm-ring', { id: a.id, label: a.label || '闹钟', time: timeStr });
    }
    if (a.repeat === 'once') {
      a.enabled = false;
    }
  }
  saveAlarms(alarms);
}
function startAlarmTimer() {
  if (alarmTimer) return;
  alarmTimer = setInterval(checkAlarms, 5000);
  setTimeout(checkAlarms, 1000);
}

// ===== 窗口拖拽 =====
ipcMain.on('drag-move', (_e, { x, y }) => {
  if (petWin && !petWin.isDestroyed()) {
    petWin.setPosition(Math.round(x), Math.round(y));
  }
});

// ===== 生命周期 =====
app.whenReady().then(() => {
  createPetWindow();
  createTray();
  startAlarmTimer();
});

app.on('window-all-closed', () => {});
app.on('activate', () => {
  if (!petWin || petWin.isDestroyed()) createPetWindow();
  if (!settingsWin || settingsWin.isDestroyed()) openSettingsWindow();
});