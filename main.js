const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, Notification, session, net } = require('electron');
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
  try {
    if (!fs.existsSync(p)) return def;
    let txt = fs.readFileSync(p, 'utf8');
    if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1); // 兼容带 BOM 的 JSON
    return JSON.parse(txt);
  } catch { return def; }
}
function writeJSON(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ===== 桌宠配置 =====
function getConfig() {
  const cfg = readJSON(configPath, null);
  return Object.assign({ size: 100, locked: true, anim: 'normal', pet: 'pet-default', chatIntervalMin: 40 }, cfg || {});
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
      {
        label: '🤖 主动搭话间隔',
        submenu: CHAT_INTERVALS.map(iv => ({
          label: iv.label,
          type: 'radio',
          checked: (cfg.chatIntervalMin || 0) === iv.value,
          click: () => {
            const c = getConfig(); c.chatIntervalMin = iv.value; saveConfig(c);
            applyProactiveChatTimer();
            createTray();
          },
        })),
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
  if (cfg.city !== undefined) c.city = cfg.city;
  if (cfg.chatIntervalMin !== undefined) c.chatIntervalMin = cfg.chatIntervalMin;
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
  const msgList = payload?.messages || [{ role: 'user', content: String(payload) }];
  return callAI(msgList, cfg);
});

// 通用 AI 调用
// Node 原生 https 请求（OpenSSL 栈直连；Chromium 网络栈对某些网关 TLS 指纹会 RST）
function httpsRequestWithBody(url, opts, bodyObj, signal) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'http:' ? require('http') : require('https');
    const payload = bodyObj === undefined ? null : JSON.stringify(bodyObj);
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method: opts.method || 'POST',
      headers: Object.assign({}, opts.headers, payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      signal,
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', d => { raw += d; });
      res.on('end', () => resolve({ status: res.statusCode, text: raw }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function callAI(msgList, cfg) {
  if (!cfg.apiKey) return { success: false, error: '请先配置 API 密钥' };
  if (!cfg.apiUrl) return { success: false, error: '请先配置 API 地址' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90s 超时
  try {
    const url = `${cfg.apiUrl.replace(/\/+$/, '')}/chat/completions`;
    const res = await httpsRequestWithBody(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
    }, {
      model: cfg.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: cfg.systemPrompt || getDefaultAIConfig().systemPrompt },
        ...msgList,
      ],
      max_tokens: 1024, temperature: 0.8,
    }, controller.signal);
    clearTimeout(timeout);
    if (res.status < 200 || res.status >= 300) {
      return { success: false, error: `API ${res.status}: ${res.text.slice(0, 200)}` };
    }
    let data;
    try { data = JSON.parse(res.text); }
    catch { return { success: false, error: 'API 返回非 JSON：' + res.text.slice(0, 120) }; }
    return { success: true, reply: (data.choices?.[0]?.message?.content || '').trim() };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError' || err.code === 'ETIMEDOUT' || err.message === 'timeout') {
      return { success: false, error: '请求超时，请检查网络或换一个更快的模型' };
    }
    return { success: false, error: `请求失败: ${err.message}` };
  }
}

// ===== 启动天气问候 =====
const WEATHERCODES = {
  0: '晴', 1: '大部晴朗', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '阵雪',
  95: '雷雨', 96: '雷雨伴冰雹', 99: '强雷雨伴冰雹',
};

// 方式1：按城市名 / IP 查天气（wttr.in）
async function getWeatherFromWttr(city) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const q = city ? encodeURIComponent(city) + '/' : '';
    const res = await fetch('https://wttr.in/' + q + '?format=j1&lang=zh', { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const cc = data.current_condition?.[0];
    if (!cc) return null;
    const area = data.nearest_area?.[0];
    const descArr = cc.lang_zh?.[0]?.value || cc.weatherDesc?.[0]?.value || '';
    return {
      city: city || area?.areaName?.[0]?.value || '',
      text: String(descArr),
      temp: cc.temp_C,
      humidity: cc.humidity,
      wind: cc.windspeedKmph,
    };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// 方式2：按经纬度查天气（open-meteo）+ 反查城市名（bigdatacloud）
async function getWeatherByCoords(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current_weather=true&timezone=auto',
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const cw = data.current_weather;
    if (!cw) return null;
    let city = '';
    try {
      const rc = await fetch(
        'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=zh',
        { signal: controller.signal }
      );
      if (rc.ok) {
        const rd = await rc.json();
        city = rd.city || rd.locality || rd.principalSubdivision || '';
      }
    } catch (e) { /* 城市反查失败则留空 */ }
    return {
      city,
      text: WEATHERCODES[cw.weathercode] || '天气未知',
      temp: cw.temperature,
      humidity: '',
      wind: cw.windspeed,
    };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendGreeting(weather) {
  const cfg = getAIConfig();
  let text = null;
  if (cfg.apiKey) {
    const userMsg = weather
      ? `我刚启动电脑。现在实时天气：城市${weather.city || '你所在城市'}，天气${weather.text}，气温${weather.temp}°C${weather.humidity ? '，湿度' + weather.humidity + '%' : ''}${weather.wind ? '，风速' + weather.wind + 'km/h' : ''}。请用一句简短的问候跟我打招呼，并结合天气给一个实用的提醒（比如带伞、添衣、防晒），语气亲切可爱，不超过50字。`
      : '我刚启动电脑，请用一句简短亲切的话欢迎我，不超过30字。';
    const res = await callAI([{ role: 'user', content: userMsg }], cfg);
    if (res.success) text = res.reply;
    else console.log('[问候AI失败]', res.error);
  }
  if (!text) {
    text = weather
      ? `${weather.city || ''} ${weather.text} ${weather.temp}°C ｜ 记得关注天气变化哦～`
      : '欢迎回来～ 有什么想聊的吗？';
  }
  console.log('[问候]', text);
  setTimeout(() => {
    if (petWin && !petWin.isDestroyed()) {
      petWin.webContents.send('ai-greeting', text);
    }
  }, 1000);
}

let startupGreetingDone = false;
let readyForCoords = false;
let coordsResolver = null;
let coordsTimer = null;

ipcMain.handle('report-coords', (_e, lat, lon) => {
  if (readyForCoords && coordsResolver && typeof lat === 'number' && typeof lon === 'number') {
    clearTimeout(coordsTimer);
    readyForCoords = false;
    const r = coordsResolver;
    coordsResolver = null;
    r({ lat, lon });
  }
  return { ok: true };
});

function waitForCoords(ms) {
  return new Promise(resolve => {
    readyForCoords = true;
    coordsResolver = resolve;
    coordsTimer = setTimeout(() => {
      readyForCoords = false;
      coordsResolver = null;
      resolve(null);
    }, ms);
  });
}

async function sendStartupGreeting() {
  if (startupGreetingDone) return;
  startupGreetingDone = true;
  const cfg = getConfig();
  const city = cfg.city || '';
  let weather = null;
  if (city) {
    // 用户手动配置的城市最优先
    weather = await getWeatherFromWttr(city);
  } else {
    // 请求 pet 窗口用系统定位拿坐标
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send('request-coords');
    const coords = await waitForCoords(8000);
    if (coords) weather = await getWeatherByCoords(coords.lat, coords.lon);
    if (!weather) weather = await getWeatherFromWttr('');
  }
  console.log('[问候天气]', weather ? `${weather.city} ${weather.text} ${weather.temp}°C 湿度${weather.humidity || '-'}%` : '无天气数据');
  await sendGreeting(weather);
}

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

// ===== 定期主动搭话（间隔可在托盘菜单调整）=====
const CHAT_INTERVALS = [
  { label: '停用', value: 0 },
  { label: '1 分钟', value: 1 },
  { label: '5 分钟', value: 5 },
  { label: '10 分钟', value: 10 },
  { label: '20 分钟', value: 20 },
  { label: '30 分钟', value: 30 },
  { label: '40 分钟', value: 40 },
  { label: '60 分钟', value: 60 },
  { label: '120 分钟', value: 120 },
];
let proactiveTimer = null;
let proactiveChatting = false;

async function sendProactiveChat() {
  if (proactiveChatting) return; // 防止上一次还没结束时重叠
  const cfg = getAIConfig();
  if (!cfg.apiKey || !cfg.apiUrl) return;
  proactiveChatting = true;
  try {
    const res = await callAI([
      { role: 'user', content: '主动说一句轻松随意的日常话：可以关心我、分享一个小趣事、或者俏皮地提醒我休息喝水活动一下，语气符合你的桌宠人设，简短可爱，不超过40字，不要用固定的问候模板，越自然越好。' },
    ], cfg);
    if (res.success && res.reply) {
      console.log('[主动搭话]', res.reply);
      setTimeout(() => {
        if (petWin && !petWin.isDestroyed()) petWin.webContents.send('ai-greeting', res.reply);
      }, 300);
    } else {
      console.log('[主动搭话失败]', res.error);
    }
  } finally {
    proactiveChatting = false;
  }
}

function applyProactiveChatTimer() {
  if (proactiveTimer) { clearInterval(proactiveTimer); proactiveTimer = null; }
  const min = getConfig().chatIntervalMin || 0;
  if (min > 0) proactiveTimer = setInterval(sendProactiveChat, min * 60 * 1000);
  console.log('[主动搭话] 间隔:', min > 0 ? min + ' 分钟' : '停用');
}

// ===== 闹钟 =====
const alarmsPath = path.join(userDataPath, 'alarms.json');
let alarmTimer = null;

// 铃声
const DEFAULT_RINGTONE = 'D:\\新建文件夹 (2)\\SWIN - 只因你太美.mp3';
const ringtonesDir = path.join(userDataPath, 'ringtones');
const ringtonesMetaPath = path.join(userDataPath, 'ringtones.json');
const ringtoneDataCache = new Map(); // id -> base64 data URL

function getUserRingtones() {
  return readJSON(ringtonesMetaPath, []);
}
function saveUserRingtones(list) {
  writeJSON(ringtonesMetaPath, list);
}

function getRingtoneDataUrl(id) {
  if (id === 'silent') return null;
  if (ringtoneDataCache.has(id)) return ringtoneDataCache.get(id);

  let filePath = null;
  if (id === 'default') {
    filePath = DEFAULT_RINGTONE;
  } else {
    const meta = getUserRingtones().find(r => r.id === id);
    if (meta) filePath = path.join(ringtonesDir, meta.file);
  }
  if (!filePath || !fs.existsSync(filePath)) return null;

  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg';
    const dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
    ringtoneDataCache.set(id, dataUrl);
    return dataUrl;
  } catch (e) {
    console.error('[alarm] 铃声读取失败:', e.message);
    return null;
  }
}

ipcMain.handle('get-ringtones', () => {
  const builtins = [
    { id: 'default', name: '默认铃声', builtin: true },
  ];
  const customs = getUserRingtones().map(r => ({ id: r.id, name: r.name, builtin: false }));
  const silent = { id: 'silent', name: '静音', builtin: true };
  return [...builtins, ...customs, silent];
});

ipcMain.handle('pick-and-add-ringtone', async () => {
  const list = getUserRingtones();
  if (list.length >= 10) return { success: false, error: '自定义铃声最多 10 个' };
  const win = settingsWin && !settingsWin.isDestroyed() ? settingsWin : petWin;
  const opts = {
    title: '选择铃声文件',
    filters: [
      { name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] },
    ],
    properties: ['openFile'],
  };
  const res = win && !win.isDestroyed()
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts);
  if (res.canceled || !res.filePaths.length) return { success: false, error: '已取消' };
  const src = res.filePaths[0];
  const ext = path.extname(src).toLowerCase() || '.mp3';
  const id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const file = id + ext;
  try {
    fs.mkdirSync(ringtonesDir, { recursive: true });
    fs.copyFileSync(src, path.join(ringtonesDir, file));
  } catch (e) {
    return { success: false, error: '复制铃声失败: ' + e.message };
  }
  const name = path.basename(src, ext);
  const updated = getUserRingtones();
  updated.push({ id, name, file });
  saveUserRingtones(updated);
  return { success: true, ringtone: { id, name, builtin: false } };
});

ipcMain.handle('delete-ringtone', (_e, id) => {
  if (!id || id === 'default' || id === 'silent') return { success: false, error: '该铃声不可删除' };
  const list = getUserRingtones();
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return { success: false, error: '铃声不存在' };
  const meta = list[idx];
  list.splice(idx, 1);
  saveUserRingtones(list);
  try {
    const fp = path.join(ringtonesDir, meta.file);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) { /* 忽略删除文件失败 */ }
  ringtoneDataCache.delete(id);
  return { success: true };
});

ipcMain.handle('stop-alarm-sound', () => {
  // 通知所有窗口停止播放
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('alarm-stop-sound');
  }
  return { success: true };
});
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
    const ringtoneId = a.ringtone || 'default';
    const ringtoneData = getRingtoneDataUrl(ringtoneId);
    if (petWin && !petWin.isDestroyed()) {
      petWin.webContents.send('alarm-ring', { id: a.id, label: a.label || '闹钟', time: timeStr, ringtoneData });
    }
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('alarm-ring', { id: a.id, label: a.label || '闹钟', time: timeStr, ringtoneData });
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
  // 允许渲染进程使用系统定位（geolocation）
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'geolocation');
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'geolocation');

  createPetWindow();
  createTray();
  startAlarmTimer();
  applyProactiveChatTimer(); // 按托盘菜单配置的间隔主动搭话
  // 启动 4 秒后：定位/天气 → 发给 AI 生成问候 → 桌宠气泡显示
  setTimeout(sendStartupGreeting, 4000);
});

app.on('window-all-closed', () => {});
app.on('activate', () => {
  if (!petWin || petWin.isDestroyed()) createPetWindow();
  if (!settingsWin || settingsWin.isDestroyed()) openSettingsWindow();
});