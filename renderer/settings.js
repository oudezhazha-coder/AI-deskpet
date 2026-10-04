const $ = id => document.getElementById(id);

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

// ===== 退出 =====
btnQuit.addEventListener('click', () => {
  if (confirm('确定退出？')) window.petAPI.quitApp();
});

// ===== 启动 =====
loadPreview();
loadSize();
loadLock();
loadAI();