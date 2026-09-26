/** Stable Diffusion WebUI (AUTOMATIC1111) Provider：通过其 /sdapi/v1 HTTP API 出图 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureOutputDir } from '../config'
import type { AppConfig, ConnectionTestResult, GenerationRequest, GenerationResult } from '../../shared/types'
import type { ImageProvider, ProgressCb } from './types'
import { imageFileName } from './types'
import { httpGetJson, httpPostJson } from './http'

interface Txt2ImgResponse {
  images?: string[]
  info?: string
}

interface Txt2ImgInfo {
  seed?: number
  sd_model_name?: string
  infotexts?: string[]
}

/** 读取本地图片为 base64 data URL（SD WebUI 的 init_images / extras 需要） */
function fileToDataUrl(file: string): string {
  const buf = readFileSync(file)
  const ext = file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png'
  return `data:image/${ext};base64,${buf.toString('base64')}`
}

export class SdWebuiProvider implements ImageProvider {
  readonly id = 'sdwebui'
  readonly label = 'Stable Diffusion WebUI'

  private base(config: AppConfig): string {
    return config.apiBaseUrl.replace(/\/+$/, '')
  }

  async test(config: AppConfig): Promise<ConnectionTestResult> {
    const base = this.base(config)
    try {
      const opts = await httpGetJson<{ sd_model_checkpoint?: string }>(
        `${base}/sdapi/v1/options`,
        { timeoutMs: 8000 }
      )
      const model = opts.sd_model_checkpoint
      return {
        ok: true,
        message: model ? `已连接 SD WebUI，当前模型：${model}` : '已连接 SD WebUI。',
        apiBaseUrl: base
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
    const mode = request.mode ?? 'txt2img'
    const seed = request.seed >= 0 ? request.seed : -1

    const common: {
      prompt: string
      negative_prompt: string
      steps: number
      cfg_scale: number
      sampler_name: string
      seed: number
      batch_size: number
      n_iter: number
      alwayson_scripts?: Record<string, unknown>
    } = {
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      steps: request.steps,
      cfg_scale: request.cfgScale,
      sampler_name: request.sampler,
      seed,
      batch_size: request.batchSize,
      n_iter: 1
    }
    // ControlNet（需后端安装扩展，否则该字段被忽略）
    if (request.controlnet?.enabled) {
      common['alwayson_scripts'] = {
        controlnet: {
          args: [
            {
              enabled: true,
              model: request.controlnet.model,
              module: request.controlnet.module || 'none',
              weight: request.controlnet.strength
            }
          ]
        }
      }
    }

    onProgress({ stage: 'connecting', message: `连接 ${base}…`, percent: 5 })
    const taskId = `sd_${Date.now()}`
    const timer = this.startProgressPoll(base, taskId, onProgress)

    try {
      // —— 放大：SD WebUI 的 extras 接口（单图） ——
      if (mode === 'upscale') {
        if (!request.initImage) throw new Error('放大模式需要先选择源图。')
        onProgress({ stage: 'generating', message: '正在放大…', percent: 20 })
        const resp = await httpPostJson<{ image?: string; html_info?: string }>(
          `${base}/sdapi/v1/extras-single-image`,
          {
            image: fileToDataUrl(request.initImage),
            resize_mode: 0,
            upscaling_resize: request.upscaleFactor || 2,
            upscaler_1: request.upscaler || 'Lanczos'
          },
          { timeoutMs: 600000 }
        )
        if (!resp.image) throw new Error('SD WebUI 放大未返回图片。')
        onProgress({ stage: 'saving', message: '保存图片…', percent: 80 })
        const file = join(outDir, imageFileName('sd-upscale', 0, seed))
        writeFileSync(file, Buffer.from(resp.image, 'base64'))
        return { taskId, imagePaths: [file], seed, model: undefined, elapsedMs: 0 }
      }

      // —— 图生图 / 文生图 ——
      const payload = mode === 'img2img'
        ? {
            ...common,
            init_images: request.initImage ? [fileToDataUrl(request.initImage)] : undefined,
            width: request.width,
            height: request.height,
            denoising_strength: request.denoise ?? 0.6
          }
        : { ...common, width: request.width, height: request.height }
      const endpoint = mode === 'img2img' ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img'

      const resp = await httpPostJson<Txt2ImgResponse>(`${base}${endpoint}`, payload, {
        timeoutMs: 600000
      })
      const images = resp.images ?? []
      if (images.length === 0) throw new Error('后端返回了空结果。')

      let outSeed = seed
      let model: string | undefined
      if (resp.info) {
        try {
          const info = JSON.parse(resp.info) as Txt2ImgInfo
          if (info.seed !== undefined) outSeed = info.seed
          if (info.sd_model_name) model = info.sd_model_name
        } catch {
          /* info 解析失败不影响出图 */
        }
      }

      onProgress({ stage: 'saving', message: '保存图片…', percent: 80 })
      const imagePaths: string[] = []
      images.forEach((b64, i) => {
        const file = join(outDir, imageFileName(mode === 'img2img' ? 'sd-i2i' : 'sd', i, outSeed))
        writeFileSync(file, Buffer.from(b64, 'base64'))
        imagePaths.push(file)
      })

      return { taskId, imagePaths, seed: outSeed, model, elapsedMs: 0 }
    } finally {
      clearInterval(timer)
      onProgress({ stage: 'done', message: '完成', percent: 100 })
    }
  }

  /** 轮询 SD WebUI 的 /sdapi/v1/progress，反馈实时进度 */
  private startProgressPoll(base: string, taskId: string, onProgress: ProgressCb): NodeJS.Timeout {
    let finished = false
    const timer = setInterval(async () => {
      if (finished) return
      try {
        const p = await httpGetJson<{ progress: number; state?: { job?: string } }>(
          `${base}/sdapi/v1/progress`,
          { timeoutMs: 4000 }
        )
        const percent = Math.round(p.progress * 100)
        if (p.state?.job) {
          onProgress({ stage: 'generating', message: `${p.state.job} …`, percent })
        } else {
          onProgress({ stage: 'generating', message: `正在生成…`, percent })
        }
      } catch {
        /* 进度轮询失败可忽略 */
      }
    }, 1200)
    return timer
  }
}
