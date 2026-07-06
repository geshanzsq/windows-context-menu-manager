/// <reference types="vite/client" />

interface ContextMenuEntry {
  id: string
  name: string
  keyName: string
  target: string
  scope: '当前用户' | '所有用户'
  kind: '命令菜单' | '扩展处理程序'
  command: string
  icon: string
  filePath: string
  registryPath: string
  removable: boolean
}

interface RemoveResult {
  success: boolean
  removed: string[]
  failed: Array<{ name: string; reason: string }>
  backupDirectory?: string
}

interface InstalledApp {
  id: string
  name: string
  publisher: string
  executable: string
}

interface AddInstalledRequest {
  ids: string[]
  target: '所有文件' | '文件夹' | '文件夹空白处' | '磁盘' | '桌面空白处'
  scope: '当前用户' | '所有用户'
}

interface AddInstalledResult {
  added: string[]
  failed: Array<{ name: string; reason: string }>
}

interface BackupSummary { id: string; name: string; createdAt: string; count: number }
interface BackupItem { id: string; name: string; scope: string; target: string }
interface BackupDetail extends BackupSummary { items: BackupItem[] }
interface RestoreResult { restored: string[]; failed: Array<{ name: string; reason: string }> }

interface Window {
  contextMenuApi: {
    scan(): Promise<ContextMenuEntry[]>
    installedApps(): Promise<InstalledApp[]>
    addInstalled(request: AddInstalledRequest): Promise<AddInstalledResult>
    listBackups(): Promise<BackupSummary[]>
    backupDetail(id: string): Promise<BackupDetail>
    restoreBackup(backupId: string, itemIds: string[]): Promise<RestoreResult>
    remove(ids: string[]): Promise<RemoveResult>
    showFile(id: string): Promise<boolean>
    showPath(path: string): Promise<void>
  }
}
