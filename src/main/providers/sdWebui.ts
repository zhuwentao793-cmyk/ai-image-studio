/** Stable Diffusion WebUI (AUTOMATIC1111) Provider：通过其 /sdapi/v1 HTTP API 出图 */
import { writeFileSync } from 'node:fs'
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
    const payload = {
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      width: request.width,
      height: request.height,
      steps: request.steps,
      cfg_scale: request.cfgScale,
      sampler_name: request.sampler,
      seed: request.seed,
      batch_size: request.batchSize,
      n_iter: 1
    }

    onProgress({ stage: 'connecting', message: `连接 ${base}…`, percent: 5 })
    const taskId = `sd_${Date.now()}`
    const timer = this.startProgressPoll(base, taskId, onProgress)

    try {
      const resp = await httpPostJson<Txt2ImgResponse>(`${base}/sdapi/v1/txt2img`, payload, {
        timeoutMs: 600000
      })
      const images = resp.images ?? []
      if (images.length === 0) throw new Error('后端返回了空结果。')

      let seed = request.seed
      let model: string | undefined
      if (resp.info) {
        try {
          const info = JSON.parse(resp.info) as Txt2ImgInfo
          if (info.seed !== undefined) seed = info.seed
          if (info.sd_model_name) model = info.sd_model_name
        } catch {
          /* info 解析失败不影响出图 */
        }
      }

      onProgress({ stage: 'saving', message: '保存图片…', percent: 80 })
      const imagePaths: string[] = []
      images.forEach((b64, i) => {
        const file = join(outDir, imageFileName('sd', i, seed))
        writeFileSync(file, Buffer.from(b64, 'base64'))
        imagePaths.push(file)
      })

      return { taskId, imagePaths, seed, model, elapsedMs: 0 }
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
