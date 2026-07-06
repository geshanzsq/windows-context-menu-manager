import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { addInstalledContextMenus, getBackupDetail, getEntryFilePath, listBackups, removeContextMenus, restoreBackupItems, scanContextMenus, scanInstalledApps } from './registry'
import type { AddInstalledRequest } from './types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 580,
    backgroundColor: '#f3f6fb',
    title: '右键菜单管理器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.setMenuBarVisibility(false)
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

function backupRoot(): string {
  return path.join(app.getPath('documents'), '右键菜单管理器', '备份')
}

app.whenReady().then(() => {
  ipcMain.handle('context-menu:scan', () => scanContextMenus())
  ipcMain.handle('context-menu:remove', async (_event, ids: unknown) => {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw new Error('无效的项目列表')
    return removeContextMenus(ids, backupRoot())
  })
  ipcMain.handle('context-menu:installed-apps', () => scanInstalledApps())
  ipcMain.handle('context-menu:add-installed', async (_event, request: AddInstalledRequest) => {
    if (!request || typeof request !== 'object' || !Array.isArray(request.ids)) throw new Error('无效的新增参数。')
    return addInstalledContextMenus(request)
  })
  ipcMain.handle('backup:list', () => listBackups(backupRoot()))
  ipcMain.handle('backup:detail', (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效的备份编号。')
    return getBackupDetail(id)
  })
  ipcMain.handle('backup:restore', (_event, backupId: unknown, itemIds: unknown) => {
    if (typeof backupId !== 'string' || !Array.isArray(itemIds) || !itemIds.every((id) => typeof id === 'string')) throw new Error('无效的恢复参数。')
    return restoreBackupItems(backupId, itemIds)
  })
  ipcMain.handle('path:show', (_event, target: unknown) => {
    if (typeof target !== 'string') return
    shell.showItemInFolder(target)
  })
  ipcMain.handle('context-menu:show-file', (_event, id: unknown) => {
    if (typeof id !== 'string') return false
    const filePath = getEntryFilePath(id)
    if (!filePath) return false
    shell.showItemInFolder(filePath)
    return true
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
