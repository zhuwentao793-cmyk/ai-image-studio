import { app, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppConfig } from '../shared/types'

export function defaultConfig(): AppConfig {
  return {
    provider: 'mock',
    apiBaseUrl: 'http://127.0.0.1:7860',
    comfyModel: 'v1-5-pruned-emaonly.safetensors',
    outputDir: join(app.getPath('pictures'), 'AI-Image-Studio'),
    sampler: 'DPM++ 2M Karras',
    steps: 24,
    cfgScale: 7,
    width: 512,
    height: 512,
    seed: -1,
    batchSize: 1
  }
}

export function userDataFile(name: string): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, name)
}

export function loadConfig(): AppConfig {
  const file = userDataFile('config.json')
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<AppConfig>
      return { ...defaultConfig(), ...raw }
    }
  } catch (e) {
    console.error('[config] 读取失败，使用默认配置', e)
  }
  return defaultConfig()
}

export function saveConfig(config: AppConfig): AppConfig {
  const file = userDataFile('config.json')
  try {
    writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    console.error('[config] 保存失败', e)
  }
  return config
}

/** 确保输出目录存在 */
export function ensureOutputDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 用系统默认应用打开路径（文件或文件夹） */
export function openInSystem(path: string): void {
  shell.openPath(path)
}
