/** 豆包 Seedream（云端）Provider：调用火山方舟 Ark images/generations 接口出图，免显卡真实出图 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureOutputDir } from '../config'
import type { AppConfig, ConnectionTestResult, GenerationRequest, GenerationResult } from '../../shared/types'
import type { ImageProvider, ProgressCb } from './types'
import { imageFileName } from './types'
import { httpPostJsonAuth } from './http'

interface SeedreamData {
  url?: string
  b64_json?: string
  size?: string
  error?: { code?: string; message?: string }
}

interface SeedreamResponse {
  data?: SeedreamData[]
  error?: { code?: string; message?: string }
  usage?: { generated_images?: number }
}

/** 把尺寸压到 Seedream 接受的像素区间（总像素 [1280x720, 4096x4096]，保持宽高比） */
function clampSize(w: number, h: number): { w: number; h: number } {
  const MIN_PIXELS = 1280 * 720 // 921600
  const MAX_PIXELS = 4096 * 4096 // 16777216
  const MAX_SIDE = 4096
  let cw = Math.max(1, Math.round(w))
  let ch = Math.max(1, Math.round(h))
  // 先缩到单边上限内
  const sideScale = Math.min(1, MAX_SIDE / Math.max(cw, ch))
  cw = Math.round(cw * sideScale)
  ch = Math.round(ch * sideScale)
  // 再保证总像素在下限以上（等比放大）
  if (cw * ch < MIN_PIXELS) {
    const scale = Math.sqrt(MIN_PIXELS / (cw * ch))
    cw = Math.round(cw * scale)
    ch = Math.round(ch * scale)
  }
  // 兜底：总像素不能超上限
  if (cw * ch > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (cw * ch))
    cw = Math.round(cw * scale)
    ch = Math.round(ch * scale)
  }
  return { w: cw, h: ch }
}

export class SeedreamProvider implements ImageProvider {
  readonly id = 'seedream'
  readonly label = '豆包 Seedream（云端）'

  private base(config: AppConfig): string {
    return (config.seedreamApiBase || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '')
  }

  async test(config: AppConfig): Promise<ConnectionTestResult> {
    if (!config.seedreamApiKey) {
      return {
        ok: false,
        message: '未配置豆包 API Key。请到火山方舟控制台申请：ark.volcengine.com',
        apiBaseUrl: this.base(config)
      }
    }
    return {
      ok: true,
      message: `已配置 API Key，将使用模型 ${config.seedreamModel}（免显卡云端出图）`,
      apiBaseUrl: this.base(config)
    }
  }

  async generate(
    config: AppConfig,
    request: GenerationRequest,
    onProgress: ProgressCb
  ): Promise<GenerationResult> {
    const key = config.seedreamApiKey
    if (!key) throw new Error('未配置豆包 API Key（在生成后端里填写）。')

    const outDir = ensureOutputDir(config.outputDir)
    const mode = request.mode ?? 'txt2img'
    const base = this.base(config)
    const size = clampSize(request.width, request.height)
    const seed = request.seed >= 0 ? request.seed : undefined

    const body: Record<string, unknown> = {
      model: config.seedreamModel || 'doubao-seedream-5-0-lite-260128',
      prompt: request.prompt,
      size: `${size.w}x${size.h}`,
      watermark: false,
      response_format: 'b64_json'
    }
    if (seed !== undefined) body.seed = seed

    // 图生图：读取本地源图，base64 传给 API
    if (mode === 'img2img' && request.initImage) {
      const buf = readFileSync(request.initImage)
      const ext = request.initImage.toLowerCase().endsWith('.jpg') || request.initImage.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png'
      body.image = `data:image/${ext};base64,${buf.toString('base64')}`
      onProgress({ stage: 'connecting', message: '云端图生图中…', percent: 5 })
    } else {
      onProgress({ stage: 'connecting', message: `云端出图中（${size.w}x${size.h}）…`, percent: 5 })
    }

    const { status, data } = await httpPostJsonAuth<SeedreamResponse>(
      `${base}/images/generations`,
      body,
      { Authorization: `Bearer ${key}` },
      300000
    )

    if (status < 200 || status >= 300) {
      const msg = data.error?.message || data.error?.code || `HTTP ${status}`
      throw new Error(`Seedream 出图失败：${msg}`)
    }
    if (data.error) {
      throw new Error(`Seedream 出图失败：${data.error.message || data.error.code}`)
    }

    const images = (data.data ?? []).filter((d) => d.b64_json)
    if (images.length === 0) {
      throw new Error('Seedream 未返回图片。')
    }

    onProgress({ stage: 'saving', message: '保存图片…', percent: 80 })
    const imagePaths: string[] = []
    images.forEach((img, i) => {
      const file = join(outDir, imageFileName('seedream', i, seed ?? 0))
      writeFileSync(file, Buffer.from(img.b64_json as string, 'base64'))
      imagePaths.push(file)
    })

    return {
      taskId: `seedream_${Date.now()}`,
      imagePaths,
      seed: seed ?? -1,
      model: config.seedreamModel,
      elapsedMs: 0
    }
  }
}
