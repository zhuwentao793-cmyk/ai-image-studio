/** 自动更新模块：基于 electron-updater，从 GitHub Releases 拉取并安装新版本 */
import { app, type BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

// 更新状态：传给渲染层用于展示
export type UpdateCallback = (status: UpdateStatus) => void

let send: UpdateCallback | null = null
let downloadProgress = 0

/** 在应用就绪后调用，开始监听更新事件 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null, cb: UpdateCallback): void {
  send = cb
  autoUpdater.autoDownload = false // 发现新版本后由用户手动点下载，避免静默下载
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    send?.({ state: 'checking', message: '正在检查更新…' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send?.({
      state: 'available',
      message: `发现新版本 v${info.version}`,
      version: info.version,
      progress: 0
    })
  })

  autoUpdater.on('update-not-available', () => {
    send?.({ state: 'not-available', message: '已是最新版本' })
  })

  autoUpdater.on('update-downloaded', () => {
    send?.({ state: 'downloaded', message: '新版本已就绪，重启即可安装', progress: 100 })
  })

  autoUpdater.on('download-progress', (p) => {
    downloadProgress = Math.round(p.percent)
    send?.({ state: 'downloading', message: `下载中 ${downloadProgress}%`, progress: downloadProgress })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err)
    send?.({ state: 'error', message: `更新出错：${err.message}` })
  })

  // 仅生产环境且不是打包在开发状态时，启动后自动检查（延迟 3s 避免干扰首屏）
  if (!app.isPackaged) {
    send?.({ state: 'not-available', message: '开发模式不检查更新' })
    return
  }
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      console.error('[updater] check failed', e)
      send?.({ state: 'error', message: '检查更新失败' })
    })
  }, 3000)
}

/** 触发一次手动检查 */
export function checkForUpdates(cb: UpdateCallback): void {
  send = cb
  autoUpdater.checkForUpdates().catch((e) => {
    cb({ state: 'error', message: `检查更新失败：${e instanceof Error ? e.message : String(e)}` })
  })
}

/** 开始下载新版本 */
export async function downloadUpdate(cb: UpdateCallback): Promise<{ ok: boolean; message?: string }> {
  send = cb
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** 退出并安装（重启后生效） */
export function quitAndInstall(): void {
  setImmediate(() => {
    autoUpdater.quitAndInstall()
    app.quit()
  })
}
