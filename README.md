# AI 桌宠 🐾

一个浮在桌面上的 AI 桌面宠物，用 Electron 构建，支持聊天、动画、锁定、对话记录。

## 功能

- 🖼️ **透明浮窗桌面宠**——图片浮在桌面上，无窗口边框
- 💬 **AI 聊天**——右键 → 聊天，和 AI 宠物对话
- 🎬 **动画效果**——回复时宠物会跳动
- 🔒 **锁定/解锁**——锁定后不可拖拽
- 📋 **对话记录**——自动保存最近 10 条聊天
- ⚙️ **AI 配置**——支持自定义 API 地址、Key、模型、系统提示词

## 使用

```bash
npm install
npm start
```

首次启动后右键 → ⚙️ 设置，填入 AI 的 API 地址和 Key。

## 技术栈

- Electron
- HTML / CSS / JavaScript
- OpenAI-compatible API