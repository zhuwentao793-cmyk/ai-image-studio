import type { AppConfig, ConnectionTestResult, GenerationProgress, GenerationRequest, GenerationResult } from '../../shared/types'

/** 一个图像生成后端的最小接口 */
export interface ImageProvider {
  readonly id: string
  readonly label: string
  /** 探测后端是否可用，并返回模型列表（可选） */
  test(config: AppConfig): Promise<ConnectionTestResult>
  /** 同步生成一张或多张图，返回本地保存路径 */
  generate(
    config: AppConfig,
    request: GenerationRequest,
    onProgress: (p: GenerationProgress) => void
  ): Promise<GenerationResult>
}

export type ProgressCb = (p: GenerationProgress) => void

/** 生成一张带时间戳的图片文件名 */
export function imageFileName(prefix: string, index: number, seed: number, ext = 'png'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${prefix}_${stamp}_seed${seed}_${index + 1}.${ext}`
}
