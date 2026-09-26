# AI 图像工作室（AI Image Studio）

本地部署的 **AI 图像生成桌面应用**（Windows / macOS），支持 **Stable Diffusion WebUI**、**ComfyUI** 与 **演示模式** 三种后端。图片、配置、历史全部保存在本地。

## ✨ 功能

- 🎛 三种生成后端可切换：Stable Diffusion WebUI / ComfyUI / 演示模式
- 🖼 正向 / 负向提示词 + 完整参数（宽高、步数、CFG、采样器、seed、批量数量）
- ⏱ 实时生成进度反馈
- 🗂 生成结果画廊 + 灯箱预览 + 一键打开图片 / 输出目录
- 📜 本地历史记录（最近 200 条）
- 🔌 后端连通性一键检测
- ⬆️ 应用内自动更新（electron-updater + GitHub Releases）

## 🚀 快速开始

### 0. 准备
- **Node.js 22+**（开发 / 运行）
- 想真正出图：**NVIDIA 显卡 + 已部署的 Stable Diffusion WebUI 或 ComfyUI**
- 没有显卡：用「演示模式」即可体验完整流程

### 1. 安装依赖
```bash
npm install
```

### 2. 开发模式（热更新）
```bash
npm run dev
```

### 3. 构建 + 预览
```bash
npm run build
npm run preview
```

## 📦 打包安装包

工程已配置 **electron-builder**，可打出 Windows / macOS / Linux 三种安装包。

**在本地对应系统上打包：**
```bash
npm run dist:win      # Windows → release/*.exe（NSIS 安装向导）
npm run dist:mac      # macOS   → release/*.dmg
npm run dist:linux    # Linux   → release/*.AppImage
```

> 说明：macOS 的 `.dmg` 只能在 **macOS** 上构建；Windows 的 `.exe` 在 Windows 上构建最稳（在 Linux 上需 wine，且可能受限）。推荐用仓库自带的 **GitHub Actions 工作流**（`.github/workflows/build-installers.yml`），它会在 Windows/macOS/Linux 三台原生 runner 上自动构建并上传三种安装包——推一个 `v0.1.0` 这样的 tag 即可触发。

**产物清单**（以 `npm run dist:win` 为例）：
- `release/AI Image Studio Setup 0.1.0.exe` — Windows 安装向导（可选安装目录、桌面快捷方式）
- `release/win-unpacked/` — Windows 免安装版（可直接运行）
- `release/AI Image Studio-0.1.0.AppImage` — Linux 免安装版

## 🧭 使用步骤

1. 启动应用，默认处于「演示模式」，直接点 **生成图像** 即可看到效果。
2. 若要接入真实后端：
   - **Stable Diffusion WebUI**：在 SD 目录用 `./webui.sh --api` 启动，然后在应用里选「Stable Diffusion WebUI」，API 地址填 `http://127.0.0.1:7860`，点「测试连接」确认。
   - **ComfyUI**：启动 ComfyUI（默认 `http://127.0.0.1:8188`），在应用里选「ComfyUI」，填地址、确认基础模型名，测试连接。
3. 填写正向 / 负向提示词与参数，点击「生成图像」。
4. 结果出现在右侧画廊，点图放大，可打开图片或输出目录。

## 🔌 本地后端部署参考

**Stable Diffusion WebUI（带 API）**
```bash
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui
cd stable-diffusion-webui
./webui.sh --api        # Windows 用 webui-user.bat，确保启用 --api
```

**ComfyUI**
```bash
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
python main.py          # 默认监听 127.0.0.1:8188
```
> 均需按官方文档安装对应显卡驱动与模型（如 SD 1.5 / SDXL checkpoint）。

## 🛠 技术栈

- **Electron** 33 + **electron-vite** 2
- **React 18 + TypeScript + Vite**
- 主进程 Node HTTP 调用后端 API；内置最小 PNG 编码器供演示模式使用

## 📁 目录结构

见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) —— 包含架构图、Provider 协议、数据持久化、安全边界与验证记录。

## ✅ 已验证

- 类型检查、生产构建均通过
- 演示模式端到端生成管线（出图 → 保存 → 历史 → 进度）在真实 Electron 运行时自检通过
- 应用在无界面环境正常启动

## 📝 常见问题

**Q：没有显卡能用吗？**
可以。用「演示模式」，无需任何后端即可体验完整流程；要真实出图则需要本地 SD/ComfyUI。

**Q：生成的图片存在哪？**
默认 `~/图片/AI-Image-Studio/`，可在界面修改输出目录。

**Q：提示词写什么？**
参考 SD 常用风格：`masterpiece, best quality, highly detailed, 8k` 等；负向提示词建议 `lowres, bad anatomy, blurry, extra fingers`。

## 📄 License
MIT
