/** ComfyUI Provider：通过其 /prompt + /history API 出图 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ensureOutputDir } from '../config'
import type { AppConfig, ConnectionTestResult, GenerationRequest, GenerationResult } from '../../shared/types'
import type { ImageProvider, ProgressCb } from './types'
import { imageFileName } from './types'
import { httpGetJson, httpPostJson } from './http'

interface ComfyPromptResponse {
  prompt_id: string
  error?: unknown
}

interface HistoryOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>
}

interface HistoryEntryData {
  status?: { status_str?: string; completed?: boolean }
  outputs?: Record<string, HistoryOutput>
}

type History = Record<string, HistoryEntryData>

interface UploadResponse {
  name?: string
  subfolder?: string
  type?: string
}

export class ComfyUiProvider implements ImageProvider {
  readonly id = 'comfyui'
  readonly label = 'ComfyUI'

  private base(config: AppConfig): string {
    return config.apiBaseUrl.replace(/\/+$/, '')
  }

  async test(config: AppConfig): Promise<ConnectionTestResult> {
    const base = this.base(config)
    try {
      await httpGetJson<unknown>(`${base}/system_stats`, { timeoutMs: 8000 })
      let models: string[] = []
      try {
        const info = await httpGetJson<Record<string, { input?: { required?: Record<string, unknown> } }>>(
          `${base}/object_info/CheckpointLoaderSimple`,
          { timeoutMs: 8000 }
        )
        const required = info['CheckpointLoaderSimple']?.input?.required
        if (required && 'ckpt_name' in required) {
          const list = (required as { ckpt_name: unknown[] }).ckpt_name[0]
          if (Array.isArray(list)) models = list.map((m) => String(m))
        }
      } catch {
        /* 模型列表拉取失败可忽略 */
      }
      return {
        ok: true,
        message: models.length ? `已连接 ComfyUI，可用模型 ${models.length} 个` : '已连接 ComfyUI。',
        apiBaseUrl: base,
        models
      }
    } catch (e) {
      return {
        ok: false,
        message: `无法连接 ${base}：${e instanceof Error ? e.message : String(e)}`,
        apiBaseUrl: base
      }
    }
  }

  /** 上传本地图片到 ComfyUI，返回节点引用的文件名 */
  private async uploadImage(base: string, file: string): Promise<string> {
    const buf = readFileSync(file)
    const fd = new FormData()
    fd.append('image', new Blob([buf]), basename(file))
    const res = await fetch(`${base}/upload/image`, {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(60000)
    })
    if (!res.ok) throw new Error(`上传源图失败 HTTP ${res.status}`)
    const data = (await res.json()) as UploadResponse
    if (!data.name) throw new Error('上传源图失败：未返回文件名。')
    return data.name
  }

  async generate(
    config: AppConfig,
    request: GenerationRequest,
    onProgress: ProgressCb
  ): Promise<GenerationResult> {
    const base = this.base(config)
    const outDir = ensureOutputDir(config.outputDir)
    const clientId = randomUUID()
    const seed = request.seed >= 0 ? request.seed : Math.floor(Math.random() * 2 ** 31)
    const mode = request.mode ?? 'txt2img'

    // 图生图/放大需要先上传源图
    let initName: string | undefined
    if ((mode === 'img2img' || mode === 'upscale') && request.initImage) {
      onProgress({ stage: 'connecting', message: '上传源图到 ComfyUI…', percent: 3 })
      initName = await this.uploadImage(base, request.initImage)
    }

    // —— 组装工作流 ——
    let workflow: Record<string, Record<string, unknown>>

    if (mode === 'txt2img') {
      workflow = {
        '3': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: config.comfyModel } },
        '4': { class_type: 'CLIPTextEncode', inputs: { text: request.prompt, clip: ['3', 1] } },
        '5': { class_type: 'CLIPTextEncode', inputs: { text: request.negativePrompt, clip: ['3', 1] } },
        '6': { class_type: 'EmptyLatentImage', inputs: { width: request.width, height: request.height, batch_size: request.batchSize } },
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed, steps: request.steps, cfg: request.cfgScale,
            sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1,
            model: ['3', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0]
          }
        },
        '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 2] } },
        '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'ai-studio' } }
      }
    } else if (mode === 'img2img') {
      if (!initName) throw new Error('图生图模式需要先选择源图。')
      workflow = {
        '3': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: config.comfyModel } },
        '4': { class_type: 'CLIPTextEncode', inputs: { text: request.prompt, clip: ['3', 1] } },
        '5': { class_type: 'CLIPTextEncode', inputs: { text: request.negativePrompt, clip: ['3', 1] } },
        '10': { class_type: 'LoadImage', inputs: { image: initName } },
        '11': { class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['3', 2] } },
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed, steps: request.steps, cfg: request.cfgScale,
            sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: request.denoise ?? 0.6,
            model: ['3', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['11', 0]
          }
        },
        '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 2] } },
        '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'ai-studio-i2i' } }
      }
    } else {
      // upsample：源图 → VAEEncode → LatentUpscale → KSampler(低重绘) → Decode → Save
      if (!initName) throw new Error('放大模式需要先选择源图。')
      const factor = request.upscaleFactor ?? 2
      const uw = Math.round(request.width * factor)
      const uh = Math.round(request.height * factor)
      workflow = {
        '3': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: config.comfyModel } },
        '4': { class_type: 'CLIPTextEncode', inputs: { text: request.prompt, clip: ['3', 1] } },
        '5': { class_type: 'CLIPTextEncode', inputs: { text: request.negativePrompt, clip: ['3', 1] } },
        '10': { class_type: 'LoadImage', inputs: { image: initName } },
        '11': { class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['3', 2] } },
        '12': {
          class_type: 'LatentUpscale',
          inputs: { samples: ['11', 0], upscale_method: 'nearest-exact', width: uw, height: uh, crop: 'disabled' }
        },
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed, steps: request.steps, cfg: request.cfgScale,
            sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: request.denoise ?? 0.3,
            model: ['3', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['12', 0]
          }
        },
        '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 2] } },
        '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'ai-studio-upscale' } }
      }
    }

    onProgress({ stage: 'connecting', message: `提交到 ComfyUI ${base}…`, percent: 5 })
    const resp = await httpPostJson<ComfyPromptResponse>(
      `${base}/prompt`,
      { prompt: workflow, client_id: clientId },
      { timeoutMs: 30000 }
    )
    if (!resp.prompt_id || resp.error) {
      throw new Error(`ComfyUI 提交失败${resp.error ? `：${JSON.stringify(resp.error)}` : ''}`)
    }
    const promptId = resp.prompt_id

    // 轮询 /history 直到出现图片输出
    let entry: HistoryEntryData | undefined
    const deadline = Date.now() + 600000
    while (Date.now() < deadline) {
      onProgress({ stage: 'generating', message: 'ComfyUI 正在生成…' })
      await sleep(1500)
      const history = await httpGetJson<History>(`${base}/history/${promptId}`, { timeoutMs: 10000 })
      const hit = history[promptId]
      if (hit) {
        entry = hit
        if (hit.status?.completed) break
        const imgs = Object.values(hit.outputs ?? {}).flatMap((o) => o.images ?? [])
        if (imgs.length > 0) break
      }
    }

    if (!entry) throw new Error('等待 ComfyUI 生成超时。')
    const images = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? [])
    if (images.length === 0) {
      throw new Error('ComfyUI 未返回图片。')
    }

    onProgress({ stage: 'saving', message: '保存图片…', percent: 80 })
    const imagePaths: string[] = []
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      const url = `${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(
        img.subfolder
      )}&type=${img.type}`
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const file = join(outDir, imageFileName(mode === 'img2img' ? 'comfy-i2i' : mode === 'upscale' ? 'comfy-upscale' : 'comfy', i, seed))
      writeFileSync(file, buf)
      imagePaths.push(file)
    }

    return {
      taskId: `comfy_${promptId}`,
      imagePaths,
      seed,
      model: config.comfyModel,
      elapsedMs: 0
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
