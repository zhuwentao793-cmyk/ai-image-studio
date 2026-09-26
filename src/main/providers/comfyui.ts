import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

  async generate(
    config: AppConfig,
    request: GenerationRequest,
    onProgress: ProgressCb
  ): Promise<GenerationResult> {
    const base = this.base(config)
    const outDir = ensureOutputDir(config.outputDir)
    const clientId = randomUUID()
    const seed = request.seed >= 0 ? request.seed : Math.floor(Math.random() * 2 ** 31)

    const workflow = {
      '3': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: config.comfyModel }
      },
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: { text: request.prompt, clip: ['3', 1] }
      },
      '5': {
        class_type: 'CLIPTextEncode',
        inputs: { text: request.negativePrompt, clip: ['3', 1] }
      },
      '6': {
        class_type: 'EmptyLatentImage',
        inputs: { width: request.width, height: request.height, batch_size: request.batchSize }
      },
      '7': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: request.steps,
          cfg: request.cfgScale,
          sampler_name: 'dpmpp_2m',
          scheduler: 'karras',
          denoise: 1,
          model: ['3', 0],
          positive: ['4', 0],
          negative: ['5', 0],
          latent_image: ['6', 0]
        }
      },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 2] } },
      '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'ai-studio' } }
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
      const file = join(outDir, imageFileName('comfy', i, seed))
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
