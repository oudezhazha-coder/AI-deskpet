const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
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
  return readJSON(configPath, { size: 100, locked: true });
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
    backgroundColor: '#fdf6e3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  const sx = Math.round((sw - 580) / 2);
  const sy = Math.round((sh - 620) / 2);
  settingsWin.setPosition(Math.max(sx, 0), Math.max(sy, 0));
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });

  // 桌宠窗口放在设置窗口右边
  if (petWin && !petWin.isDestroyed()) {
    const [swX, swY] = settingsWin.getPosition();
    petWin.setPosition(swX + 588, swY + 20);
  }
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
  saveConfig(c);
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('config-changed', c);
  if (cfg.size && petWin && !petWin.isDestroyed()) {
    const s = cfg.size / 100;
    petWin.setSize(Math.round(260 * s), Math.round(380 * s));
  }
  return { success: true };
});

// 图片
ipcMain.handle('get-image', () => {
  const imgPath = path.join(__dirname, 'resources', 'pet-default.png');
  if (!fs.existsSync(imgPath)) return null;
  const data = fs.readFileSync(imgPath);
  return `data:image/png;base64,${data.toString('base64')}`;
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

ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('open-settings', () => openSettingsWindow());

// 对话历史
ipcMain.handle('get-chat-history', () => getChatHistory());
ipcMain.handle('append-chat-history', (_e, entry) => {
  const h = getChatHistory();
  h.push(entry);
  saveChatHistory(h);
  return { success: true };
});

// ===== 生命周期 =====
app.whenReady().then(() => {
  createPetWindow();
  createTray();
});

app.on('window-all-closed', () => {});
app.on('activate', () => {
  if (!petWin || petWin.isDestroyed()) createPetWindow();
  if (!settingsWin || settingsWin.isDestroyed()) openSettingsWindow();
});