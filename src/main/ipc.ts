import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { getProvider } from './providers'
import { loadConfig, saveConfig, openInSystem } from './config'
import { addHistory, clearHistory, getHistory } from './store'
import {
  IPC,
  type AppConfig,
  type ConnectionTestResult,
  type GenerateOutput,
  type GenerationProgress,
  type GenerationRequest,
  type HistoryEntry
} from '../shared/types'

/** 所有主进程能力封装成工具，避免在入口堆积 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const sendProgress = (p: GenerationProgress): void => {
    getWindow()?.webContents.send(IPC.progress, p)
  }

  ipcMain.handle(IPC.getConfig, (): AppConfig => loadConfig())
  ipcMain.handle(IPC.defaultConfig, (): AppConfig => loadConfig())
  ipcMain.handle(IPC.setConfig, (_e, partial: Partial<AppConfig>): AppConfig => {
    return saveConfig({ ...loadConfig(), ...partial })
  })

  ipcMain.handle(
    IPC.testConnection,
    async (_e, cfg: AppConfig): Promise<ConnectionTestResult> => {
      return getProvider(cfg.provider).test(cfg)
    }
  )

  ipcMain.handle(
    IPC.generate,
    async (_e: IpcMainInvokeEvent, cfg: AppConfig, req: GenerationRequest): Promise<GenerateOutput> => {
      const provider = getProvider(cfg.provider)
      const taskId = `${cfg.provider}_${randomUUID()}`
      try {
        sendProgress({ stage: 'connecting', message: '开始生成…', percent: 0 })
        const result = await provider.generate(cfg, req, sendProgress)
        const entry: HistoryEntry = {
          id: taskId,
          createdAt: new Date().toISOString(),
          prompt: req.prompt,
          negativePrompt: req.negativePrompt,
          params: {
            width: req.width,
            height: req.height,
            steps: req.steps,
            cfgScale: req.cfgScale,
            sampler: req.sampler,
            seed: result.seed,
            batchSize: req.batchSize
          },
          provider: cfg.provider,
          model: result.model,
          imagePaths: result.imagePaths
        }
        addHistory(entry)
        sendProgress({ stage: 'done', message: '完成', percent: 100 })
        return { result }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        sendProgress({ stage: 'error', message: msg })
        return { error: msg }
      }
    }
  )

  ipcMain.handle(IPC.history, (): HistoryEntry[] => getHistory())
  ipcMain.handle(IPC.clearHistory, (): HistoryEntry[] => clearHistory())

  ipcMain.handle(IPC.openOutputDir, (_e, dir: string): { ok: boolean; message?: string } => {
    try {
      openInSystem(dir)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    IPC.openImage,
    (_e, file: string): { ok: boolean; message?: string } => {
      try {
        openInSystem(file)
        return { ok: true }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(IPC.pickDirectory, async (): Promise<string | null> => {
    const win = getWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

export { app }
