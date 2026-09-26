import type { ImageProvider } from './types'
import { MockProvider } from './mock'
import { SdWebuiProvider } from './sdWebui'
import { ComfyUiProvider } from './comfyui'

export const providers: ImageProvider[] = [new SdWebuiProvider(), new ComfyUiProvider(), new MockProvider()]

const byId = new Map<string, ImageProvider>(providers.map((p) => [p.id, p]))

export function getProvider(id: string): ImageProvider {
  const p = byId.get(id)
  if (!p) throw new Error(`未知的生成后端：${id}`)
  return p
}
