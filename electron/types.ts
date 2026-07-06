export type MenuScope = '当前用户' | '所有用户'
export type MenuKind = '命令菜单' | '扩展处理程序'

export interface ContextMenuEntry {
  id: string
  name: string
  keyName: string
  target: string
  scope: MenuScope
  kind: MenuKind
  command: string
  icon: string
  filePath: string
  registryPath: string
  removable: boolean
}

export interface RemoveResult {
  success: boolean
  removed: string[]
  failed: Array<{ name: string; reason: string }>
  backupDirectory?: string
}

export interface AddMenuRequest {
  name: string
  executable: string
  target: '所有文件' | '文件夹' | '文件夹空白处' | '磁盘' | '桌面空白处'
  scope: MenuScope
}

export interface InstalledApp {
  id: string
  name: string
  publisher: string
  executable: string
}

export interface AddInstalledRequest {
  ids: string[]
  target: AddMenuRequest['target']
  scope: MenuScope
}

export interface AddInstalledResult {
  added: string[]
  failed: Array<{ name: string; reason: string }>
}

export interface BackupSummary {
  id: string
  name: string
  createdAt: string
  count: number
}

export interface BackupItem {
  id: string
  name: string
  scope: string
  target: string
}

export interface BackupDetail extends BackupSummary {
  items: BackupItem[]
}

export interface RestoreResult {
  restored: string[]
  failed: Array<{ name: string; reason: string }>
}
