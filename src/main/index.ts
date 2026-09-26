import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { ensureOutputDir } from './config'
import { initAutoUpdater } from './updater'
import { IPC } from '../shared/types'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'AI 图像工作室',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // 外部链接用系统浏览器打开，不劫持应用内
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // 提前确保输出目录存在
  try {
    const { loadConfig } = require('./config') as typeof import('./config')
    ensureOutputDir(loadConfig().outputDir)
  } catch {
    /* 初始化输出目录失败不阻塞启动 */
  }

  const win = createWindow()
  registerIpc(() => BrowserWindow.getAllWindows()[0] ?? win)

  // 初始化自动更新（生产环境启动后延迟检查）
  initAutoUpdater(() => BrowserWindow.getAllWindows()[0] ?? win, (s) => {
    win.webContents.send(IPC.updateStatus, s)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
