import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type AppConfig,
  type ConnectionTestResult,
  type GenerateOutput,
  type GenerationProgress,
  type GenerationRequest,
  type HistoryEntry,
  type UpdateStatus
} from '../shared/types'

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.getConfig),
  defaultConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.defaultConfig),
  setConfig: (partial: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.setConfig, partial),
  testConnection: (cfg: AppConfig): Promise<ConnectionTestResult> =>
    ipcRenderer.invoke(IPC.testConnection, cfg),
  generate: (cfg: AppConfig, req: GenerationRequest): Promise<GenerateOutput> =>
    ipcRenderer.invoke(IPC.generate, cfg, req),
  history: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.history),
  clearHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.clearHistory),
  openOutputDir: (dir: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke(IPC.openOutputDir, dir),
  openImage: (file: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke(IPC.openImage, file),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickDirectory),
  onProgress: (cb: (p: GenerationProgress) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, p: GenerationProgress): void => cb(p)
    ipcRenderer.on(IPC.progress, listener)
    return () => ipcRenderer.removeListener(IPC.progress, listener)
  },
  // —— 自动更新 ——
  updateCheck: (): Promise<void> => ipcRenderer.invoke(IPC.updateCheck),
  updateDownload: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke(IPC.updateDownload),
  updateInstall: (): Promise<void> => ipcRenderer.invoke(IPC.updateInstall),
  onUpdateStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, s: UpdateStatus): void => cb(s)
    ipcRenderer.on(IPC.updateStatus, listener)
    return () => ipcRenderer.removeListener(IPC.updateStatus, listener)
  }
}

export type RendererApi = typeof api

contextBridge.exposeInMainWorld('api', api)
