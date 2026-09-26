# AI 图像工作室 —— 架构设计文档

> 本地部署的 AI 图像生成桌面应用（Windows / macOS）
> 技术栈：**Electron + React + TypeScript（electron-vite）**

## 1. 设计目标与约束

| 约束 | 决策 |
|---|---|
| 平台 | Windows / macOS 桌面客户端（跨平台） |
| 算力 | **本地部署**，依赖用户自带显卡（NVIDIA 优先） |
| 生成后端 | 优先兼容 **Stable Diffusion WebUI（AUTOMATIC1111）**，兼容 **ComfyUI** |
| 无显卡可用性 | 内置**演示模式**，无需任何后端即可跑通全流程（便于无 GPU 开发/演示） |
| 隐私 | 图片、配置、历史全部保存在本地，不上传 |
| 成本 | 应用本身免费；算力来自用户本地机器 |

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 桌面应用                       │
│                                                         │
│  ┌──────────────┐   IPC(contextBridge)   ┌────────────┐ │
│  │  Renderer    │ ◄────────────────────► │  Main      │ │
│  │  (React UI)  │    invoke / on         │  (Node)    │ │
│  │  提示词/参数  │                         │  IPC 编排   │ │
│  │  画廊/进度   │                         └─────┬──────┘ │
│  └──────────────┘                               │        │
│                                                 ▼        │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Provider 抽象层（可插拔）                            │  │
│  │  SdWebuiProvider  ComfyUiProvider  MockProvider    │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
        │ SD WebUI API                 │ ComfyUI API
        ▼                              ▼
   http://127.0.0.1:7860         http://127.0.0.1:8188
        └──────── 用户本地显卡 / 本地服务 ────────┘
```

- **渲染进程（Renderer）**：React + Vite。负责交互界面：后端选择、提示词、生成参数、进度展示、结果画廊、历史记录。
- **主进程（Main）**：Node。负责窗口管理、配置/历史持久化、调用生成后端、保存图片、系统操作（打开文件夹等）。
- **Preload**：通过 `contextBridge` 暴露最小 `window.api`，渲染进程不接触 Node，保证安全边界。
- **Provider 抽象层**：统一 `test()` / `generate()` 接口，三种后端可切换，屏蔽协议差异。

## 3. 目录结构

```
ai-image-studio/
├─ electron.vite.config.ts      # 三端构建配置（main/preload/renderer）
├─ package.json
├─ src/
│  ├─ shared/types.ts           # 主/渲染共享类型 + IPC 通道常量
│  ├─ main/
│  │  ├─ index.ts               # 窗口创建、应用生命周期、初始化更新
│  │  ├─ ipc.ts                 # 所有 IPC handler 编排（含更新）
│  │  ├─ updater.ts             # 自动更新（electron-updater）：检查/下载/安装
│  │  ├─ config.ts              # 配置读写（userData/config.json）、输出目录
│  │  ├─ store.ts               # 生成历史（userData/history.json，上限 200 条）
│  │  ├─ selfTest.ts            # 运行级自检（验证生成管线）
│  │  └─ providers/
│  │     ├─ types.ts            # ImageProvider 接口
│  │     ├─ http.ts             # 极简 HTTP 客户端（含带鉴权 POST）
│  │     ├─ png.ts              # 最小 PNG 编码器（演示模式用）
│  │     ├─ mock.ts             # 演示模式 Provider
│  │     ├─ sdWebui.ts          # Stable Diffusion WebUI Provider（txt2img/img2img/放大/ControlNet）
│  │     ├─ comfyui.ts          # ComfyUI Provider（txt2img/img2img/放大）
│  │     ├─ seedream.ts         # 豆包 Seedream 云端 Provider（txt2img/img2img）
│  │     └─ index.ts            # Provider 注册表
│  ├─ preload/index.ts          # contextBridge 安全桥接
│  └─ renderer/src/
│     ├─ App.tsx                # 应用骨架、状态编排
│     ├─ styles.css             # 深色主题样式
│     └─ components/
│        ├─ ParamsPanel.tsx     # 后端选择 + 提示词 + 参数表单
│        └─ Gallery.tsx         # 结果画廊 + 灯箱 + 历史
```

## 4. 数据与持久化

| 数据 | 位置 | 说明 |
|---|---|---|
| 配置 | `userData/config.json` | Provider、API 地址、输出目录、默认参数 |
| 生成历史 | `userData/history.json` | 最近 200 条，含提示词/参数/seed/图片路径 |
| 图片 | `~/图片/AI-Image-Studio/`（可改） | 生成结果按 `{来源}_{时间戳}_seed{seed}_{序号}.png` 命名 |

- 全部数据保存在**本机**，无任何网络上传。

## 5. Provider 协议说明

### 5.1 Stable Diffusion WebUI（推荐）
启动方式（用户机器上）：
```bash
# 在 SD WebUI 目录，带 --api 启动
./webui.sh --api
```
- **连通性检测**：`GET /sdapi/v1/options`
- **出图**：`POST /sdapi/v1/txt2img`（prompt/negative_prompt/宽高/steps/cfg/sampler/seed/batch_size）
- **进度**：轮询 `GET /sdapi/v1/progress`
- 返回 base64 图片 → 写本地 PNG；`info` 解析真实 seed 与模型名

### 5.2 ComfyUI
- **连通性检测**：`GET /system_stats`，`GET /object_info/CheckpointLoaderSimple` 拉取模型列表
- **出图**：`POST /prompt` 提交标准 txt2img 工作流 → 轮询 `GET /history/{prompt_id}` → `GET /view?filename=...` 下载图片
- 基础模型名在配置里指定（`comfyModel`）

### 5.3 豆包 Seedream（云端）
- **免显卡真实出图**：调用火山方舟 `POST https://ark.cn-beijing.volces.com/api/v3/images/generations`（Bearer 鉴权）。
- **文生图**：`{ model, prompt, size, watermark:false, response_format:'b64_json', seed? }`
- **图生图**：额外传 `image`（`data:image/png;base64,...`，读本地源图后 base64）。
- 尺寸自动压到 API 接受区间（总像素 [1280x720, 4096x4096]，保持比例）；不同模型 ID（如 `doubao-seedream-5-0-lite-260128` / `doubao-seedream-4-5-251128`）可在界面切换。返回 `data[].b64_json` 写本地。
- 需要方舟 API Key（界面填写，存本地配置）。

### 5.4 演示模式（Mock）
- 无外部依赖，依据 prompt 哈希 + seed 用内置 PNG 编码器生成确定性渐变图
- 让无显卡环境也能完整体验「出图 → 保存 → 历史」全流程

### 5.5 生成模式（各后端支持矩阵）

| 模式 | SD WebUI | ComfyUI | Seedream | 演示 |
|---|---|---|---|---|
| 文生图 | ✅ | ✅ | ✅ | ✅ |
| 图生图 | ✅ img2img（init_images + denoise） | ✅ 上传源图 + LoadImage + denoise | ✅ 传 image | 忽略源图 |
| 放大 | ✅ extras-single-image（upscaler + factor） | ✅ LatentUpscale + 低重绘 | — | 忽略 |
| ControlNet | ✅ alwayson_scripts（需扩展） | — | — | — |

> 放大时后端按 `upscaleFactor` 计算目标宽高；图生图以 `denoise` 控制重绘强度（SD/Comfy 0.05-1，默认 0.6；放大默认 0.3）。

## 6. 安全边界

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`（preload 需要）
- 渲染进程仅能调用 `window.api` 暴露的有限方法
- 外部链接一律交由系统浏览器打开，不在应用内导航
- CSP：仅允许 `self`，图片来源限于 `self file: data:`

## 7. 验证方式（本次已执行）

| 验证项 | 方式 | 结果 |
|---|---|---|
| 类型检查 | `tsc --noEmit`（node + web） | ✅ 通过 |
| 构建 | `electron-vite build`（main/preload/renderer） | ✅ 通过 |
| PNG 编码器 | node 单测 + `file` 命令校验 | ✅ 合法 PNG |
| 端到端生成 | xvfb 下运行 `selfTest.ts`：mock 出图→保存→写历史→进度事件 | ✅ 2 张图/历史 1 条 |
| 应用启动 | xvfb 下 `electron out/main` 启动 | ✅ 正常引导无崩溃 |
| 请求构造 | 桩 electron+fetch 跑 8 项断言（Seedream/SD/Comfy 三后端 × 文生图/图生图/放大/ControlNet） | ✅ 全部通过 |
| 新版 UI | xvfb 启动并截图：4 后端按钮 + 文生图/图生图/放大模式 | ✅ 渲染正常 |
| Linux 打包 | `electron-builder --linux AppImage` | ✅ 产出可用 AppImage |
| Windows 打包 | `electron-builder --win nsis` | ⚠️ Linux 上需 wine 才能最终化；已提供 CI 原生构建 |

## 8. 打包发布与自动更新

- 已接入 **electron-builder**：`win.nsis` / `mac.dmg` / `linux.AppImage` 三目标，含应用图标、NSIS 安装向导配置。
- 跨平台构建用仓库内的 **GitHub Actions 工作流**（`.github/workflows/build-installers.yml`），在 Windows/macOS/Linux 原生 runner 上自动构建并上传安装包；推 `v*` tag 触发。
- 说明：macOS DMG 必须在 macOS 上构建；Windows NSIS 在 Linux 上依赖 wine（本沙箱无法持久安装），故用 CI 原生构建最可靠。
- **自动更新**：主进程集成 `electron-updater`，启动后延迟检查 GitHub Releases 的 `latest*.yml` 更新清单；发现新版本后由用户在界面点「立即下载 / 重启安装」。CI 在推 tag 时用 `--publish always` 上传安装包与更新清单，供应用内自动读取。
- **代码签名**：已预留配置；在仓库 Secrets 填入 `CSC_LINK`/`CSC_KEY_PASSWORD`（Windows）与 `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`（macOS）后，CI 自动签名/公证。

## 9. 后续可扩展方向

- 云端多 Provider（OpenAI DALL-E / 通义万相 / Stable Diffusion API）接入
- 本地 ControlNet 在 ComfyUI 侧的节点工作流（目前仅 SD WebUI）
- 历史缩略图本地缓存与模糊搜索
- 自动改版本号与签名自检
- 进度条对接后端真实 step 进度
