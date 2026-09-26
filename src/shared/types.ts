// 主进程与渲染进程共享的类型定义

export type ProviderId = 'sdwebui' | 'comfyui' | 'mock' | 'seedream'

/** 生成模式：文生图 / 图生图 / 放大 */
export type GenMode = 'txt2img' | 'img2img' | 'upscale'

export interface ControlNetCfg {
  /** 是否启用 ControlNet（仅本地 SD WebUI 支持，需后端安装扩展） */
  enabled: boolean
  /** ControlNet 模型名，如 control_v11p_sd15_canny */
  model: string
  /** 控制强度 0-2 */
  strength: number
  /** 预处理器/模块，如 canny / pose / depth */
  module: string
}

export interface AppConfig {
  /** 当前使用的生成后端 */
  provider: ProviderId
  /** SD WebUI / ComfyUI 的 API 地址，如 http://127.0.0.1:7860 */
  apiBaseUrl: string
  /** ComfyUI 使用的基础模型名（checkpoint） */
  comfyModel: string
  /** 生成图片的保存目录 */
  outputDir: string
  /** 采样器，SD WebUI 使用 */
  sampler: string
  /** 基础模型提示词风格提示（用于 ComfyUI 的 positive 附加，可选） */
  steps: number
  cfgScale: number
  width: number
  height: number
  seed: number
  batchSize: number
  /** —— 豆包 Seedream（云端） —— */
  /** 方舟 API Key（ARK_API_KEY） */
  seedreamApiKey: string
  /** Seedream 模型 ID */
  seedreamModel: string
  /** 方舟 API 基址 */
  seedreamApiBase: string
}

export interface GenerationRequest {
  prompt: string
  negativePrompt: string
  width: number
  height: number
  steps: number
  cfgScale: number
  sampler: string
  seed: number
  batchSize: number
  /** 生成模式，默认文生图 */
  mode?: GenMode
  /** 图生图：本地源图路径 */
  initImage?: string
  /** 图生图：重绘强度 0-1 */
  denoise?: number
  /** 放大：放大倍数 */
  upscaleFactor?: number
  /** 放大：SD WebUI 使用的 upscaler 名 */
  upscaler?: string
  /** ControlNet 配置（SD WebUI） */
  controlnet?: ControlNetCfg
}

export interface GenerationProgress {
  stage: 'connecting' | 'generating' | 'saving' | 'done' | 'error'
  message: string
  /** 0-100，尽力而为的进度 */
  percent?: number
}

export interface GenerationResult {
  /** 本次任务的唯一 id */
  taskId: string
  /** 生成的图片本地路径列表 */
  imagePaths: string[]
  /** 实际使用的 seed（SD 可能自动补一个） */
  seed: number
  /** 实际使用的基础模型（如果后端返回） */
  model?: string
  elapsedMs: number
}

export interface HistoryEntry {
  id: string
  createdAt: string
  prompt: string
  negativePrompt: string
  params: {
    width: number
    height: number
    steps: number
    cfgScale: number
    sampler: string
    seed: number
    batchSize: number
  }
  provider: ProviderId
  model?: string
  imagePaths: string[]
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  /** 探测到的模型列表（ComfyUI 可用） */
  models?: string[]
  apiBaseUrl: string
}

export interface GenerateOutput {
  result?: GenerationResult
  error?: string
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  message: string
  version?: string
  progress?: number
}

// IPC 通道名常量，供 main / preload / renderer 一致引用
export const IPC = {
  getConfig: 'app:get-config',
  setConfig: 'app:set-config',
  testConnection: 'app:test-connection',
  generate: 'image:generate',
  history: 'image:history',
  clearHistory: 'image:clear-history',
  openOutputDir: 'image:open-output-dir',
  pickDirectory: 'dialog:pick-directory',
  pickImage: 'dialog:pick-image',
  openImage: 'image:open-file',
  progress: 'image:progress',
  defaultConfig: 'app:default-config',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateStatus: 'update:status'
} as const
