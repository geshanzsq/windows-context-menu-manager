import { contextBridge, ipcRenderer } from 'electron'
import type { AddInstalledRequest, AddInstalledResult, BackupDetail, BackupSummary, ContextMenuEntry, InstalledApp, RemoveResult, RestoreResult } from './types'

contextBridge.exposeInMainWorld('contextMenuApi', {
  scan: (): Promise<ContextMenuEntry[]> => ipcRenderer.invoke('context-menu:scan'),
  installedApps: (): Promise<InstalledApp[]> => ipcRenderer.invoke('context-menu:installed-apps'),
  addInstalled: (request: AddInstalledRequest): Promise<AddInstalledResult> => ipcRenderer.invoke('context-menu:add-installed', request),
  listBackups: (): Promise<BackupSummary[]> => ipcRenderer.invoke('backup:list'),
  backupDetail: (id: string): Promise<BackupDetail> => ipcRenderer.invoke('backup:detail', id),
  restoreBackup: (backupId: string, itemIds: string[]): Promise<RestoreResult> => ipcRenderer.invoke('backup:restore', backupId, itemIds),
  remove: (ids: string[]): Promise<RemoveResult> => ipcRenderer.invoke('context-menu:remove', ids),
  showFile: (id: string): Promise<boolean> => ipcRenderer.invoke('context-menu:show-file', id),
  showPath: (path: string): Promise<void> => ipcRenderer.invoke('path:show', path)
})
