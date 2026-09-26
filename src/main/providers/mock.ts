/** 演示模式 Provider：无需显卡也能跑通"出图-保存-历史"全流程，生成确定性的渐变/图案图 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureOutputDir } from '../config'
import type { AppConfig, ConnectionTestResult, GenerationRequest, GenerationResult } from '../../shared/types'
import type { ImageProvider, ProgressCb } from './types'
import { imageFileName } from './types'
import { encodePng, hashString, mulberry32 } from './png'

export class MockProvider implements ImageProvider {
  readonly id = 'mock'
  readonly label = '演示模式（无需显卡）'

  async test(_config: AppConfig): Promise<ConnectionTestResult> {
    // 演示模式永远可用
    return { ok: true, message: '演示模式始终可用，无需连接任何后端。', apiBaseUrl: '' }
  }

  async generate(
    config: AppConfig,
    request: GenerationRequest,
    onProgress: ProgressCb
  ): Promise<GenerationResult> {
    const t0 = Date.now()
    const outDir = ensureOutputDir(config.outputDir)
    const imagePaths: string[] = []
    const seed = request.seed >= 0 ? request.seed : Math.floor(Math.random() * 2 ** 31)

    onProgress({ stage: 'generating', message: '演示模式正在渲染…', percent: 10 })
    for (let i = 0; i < request.batchSize; i++) {
      const perSeed = (seed + i) >>> 0
      const buf = this.render(request.prompt, request.width, request.height, perSeed)
      const file = join(outDir, imageFileName('demo', i, perSeed))
      writeFileSync(file, buf)
      imagePaths.push(file)
      onProgress({
        stage: 'generating',
        message: `已生成 ${i + 1}/${request.batchSize}`,
        percent: 30 + Math.round(((i + 1) / request.batchSize) * 60)
      })
    }
    onProgress({ stage: 'saving', message: '保存完成', percent: 100 })

    return {
      taskId: `mock_${seed}`,
      imagePaths,
      seed,
      model: 'mock-demo',
      elapsedMs: Date.now() - t0
    }
  }

  /** 依据 prompt 与 seed 生成一幅有层次的抽象渐变图案 */
  private render(prompt: string, w: number, h: number, seed: number): Buffer {
    const h1 = hashString(prompt)
    const rnd = mulberry32(seed ^ h1)
    // 随机取 3 个锚点颜色
    const anchors = Array.from({ length: 3 }, () => ({
      x: Math.floor(rnd() * w),
      y: Math.floor(rnd() * h),
      r: Math.floor(rnd() * 256),
      g: Math.floor(rnd() * 256),
      b: Math.floor(rnd() * 256)
    }))
    // 叠加一个同心波纹
    const cx = w / 2 + (rnd() - 0.5) * w * 0.3
    const cy = h / 2 + (rnd() - 0.5) * h * 0.3

    const rgba = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // 反距离权重插值 3 个锚点
        let r = 0
        let g = 0
        let b = 0
        let wsum = 0
        for (const a of anchors) {
          const d = Math.hypot(x - a.x, y - a.y) + 1e-6
          const wi = 1 / (d * d)
          r += a.r * wi
          g += a.g * wi
          b += a.b * wi
          wsum += wi
        }
        r /= wsum
        g /= wsum
        b /= wsum
        // 波纹叠加
        const dist = Math.hypot(x - cx, y - cy)
        const ripple = 0.5 + 0.5 * Math.sin(dist / 12 + seed * 0.01)
        const idx = (y * w + x) * 4
        rgba[idx] = Math.min(255, Math.round(r * ripple))
        rgba[idx + 1] = Math.min(255, Math.round(g * (2 - ripple)))
        rgba[idx + 2] = Math.min(255, Math.round(b * 0.6))
        rgba[idx + 3] = 255
      }
    }
    return encodePng(w, h, rgba)
  }
}
