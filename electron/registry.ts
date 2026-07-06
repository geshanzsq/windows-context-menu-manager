import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { TextDecoder } from 'node:util'
import type { AddInstalledRequest, AddInstalledResult, AddMenuRequest, BackupDetail, BackupItem, BackupSummary, ContextMenuEntry, InstalledApp, MenuKind, MenuScope, RemoveResult, RestoreResult } from './types'

const execFileAsync = promisify(execFile)

interface RegistryLocation {
  hive: 'HKCU' | 'HKLM'
  path: string
  target: string
  kind: MenuKind
}

const TARGETS = [
  ['*\\shell', '所有文件', '命令菜单'],
  ['AllFilesystemObjects\\shell', '文件和文件夹', '命令菜单'],
  ['Directory\\shell', '文件夹', '命令菜单'],
  ['Directory\\Background\\shell', '文件夹空白处', '命令菜单'],
  ['Drive\\shell', '磁盘', '命令菜单'],
  ['Folder\\shell', '文件夹对象', '命令菜单'],
  ['DesktopBackground\\Shell', '桌面空白处', '命令菜单'],
  ['*\\shellex\\ContextMenuHandlers', '所有文件', '扩展处理程序'],
  ['AllFilesystemObjects\\shellex\\ContextMenuHandlers', '文件和文件夹', '扩展处理程序'],
  ['Directory\\shellex\\ContextMenuHandlers', '文件夹', '扩展处理程序'],
  ['Directory\\Background\\shellex\\ContextMenuHandlers', '文件夹空白处', '扩展处理程序'],
  ['Drive\\shellex\\ContextMenuHandlers', '磁盘', '扩展处理程序'],
  ['Folder\\shellex\\ContextMenuHandlers', '文件夹对象', '扩展处理程序']
] as const

const LOCATIONS: RegistryLocation[] = (['HKCU', 'HKLM'] as const).flatMap((hive) =>
  TARGETS.map(([suffix, target, kind]) => ({
    hive,
    path: `Software\\Classes\\${suffix}`,
    target,
    kind
  }))
)

const cache = new Map<string, ContextMenuEntry>()
const installedAppCache = new Map<string, InstalledApp>()
const backupCache = new Map<string, { summary: BackupSummary; items: Array<BackupItem & { filePath: string }> }>()

const ADD_TARGETS = {
  '所有文件': { path: '*\\shell', argument: '%1' },
  '文件夹': { path: 'Directory\\shell', argument: '%1' },
  '文件夹空白处': { path: 'Directory\\Background\\shell', argument: '%V' },
  '磁盘': { path: 'Drive\\shell', argument: '%1' },
  '桌面空白处': { path: 'DesktopBackground\\Shell', argument: '%V' }
} as const

async function reg(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('reg.exe', args, {
    windowsHide: true,
    encoding: 'buffer',
    maxBuffer: 2 * 1024 * 1024
  })
  const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
  const utf8 = buffer.toString('utf8')
  // reg.exe 在中文 Windows 上通常按系统代码页 CP936 输出；UTF-8 输出则直接保留。
  return utf8.includes('\uFFFD') ? new TextDecoder('gbk').decode(buffer) : utf8
}

function fullKey(location: RegistryLocation): string {
  return `${location.hive}\\${location.path}`
}

function childKeys(output: string, baseKey: string): string[] {
  const normalizedBase = baseKey.replace(/^HKCU/i, 'HKEY_CURRENT_USER').replace(/^HKLM/i, 'HKEY_LOCAL_MACHINE')
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^HKEY_/i.test(line) && line.toLowerCase() !== normalizedBase.toLowerCase())
    .filter((line) => line.slice(normalizedBase.length + 1).indexOf('\\') === -1)
}

function values(output: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s{2,}(.+?)\s+REG_(?:SZ|EXPAND_SZ|DWORD)\s+(.*)$/i)
    if (match) result.set(match[1].trim(), match[2].trim())
  }
  return result
}

async function query(key: string): Promise<string> {
  try { return await reg(['query', key]) } catch { return '' }
}

function idFor(key: string): string {
  return createHash('sha256').update(key.toLowerCase()).digest('hex').slice(0, 20)
}

function cleanName(raw: string): string {
  return raw.replace(/^@/, '').replace(/&/g, '').trim()
}

async function resolveHandler(clsid: string, fallback: string): Promise<{ name: string; filePath: string }> {
  if (!/^\{[0-9a-f-]+\}$/i.test(clsid)) return { name: fallback, filePath: '' }
  const output = await query(`HKCR\\CLSID\\${clsid}`)
  const name = values(output).get('(Default)')
  const server = values(await query(`HKCR\\CLSID\\${clsid}\\InprocServer32`)).get('(Default)') || ''
  return {
    name: name && name !== '(value not set)' ? cleanName(name) : fallback,
    filePath: extractFilePath(server)
  }
}

function expandEnvironmentVariables(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, key: string) => {
    const envKey = Object.keys(process.env).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
    return envKey ? process.env[envKey] || match : match
  })
}

function extractFilePath(raw: string): string {
  if (!raw) return ''
  const expanded = expandEnvironmentVariables(raw.trim().replace(/^@/, ''))
  const quoted = expanded.match(/^"([^"]+\.(?:exe|dll|com|cmd|bat))"/i)
  const unquoted = expanded.match(/^(.+?\.(?:exe|dll|com|cmd|bat))(?=\s|,|$)/i)
  const candidate = (quoted?.[1] || unquoted?.[1] || '').trim()
  return candidate && existsSync(candidate) ? candidate : ''
}

async function scanLocation(location: RegistryLocation): Promise<ContextMenuEntry[]> {
  const base = fullKey(location)
  const output = await query(base)
  const keys = childKeys(output, base)
  return Promise.all(keys.map(async (key) => {
    const rawKeyName = key.split('\\').pop() || key
    const keyName = cleanName(rawKeyName)
    const keyValues = values(await query(key))
    const defaultValue = keyValues.get('(Default)') || ''
    const verb = keyValues.get('MUIVerb') || defaultValue
    const command = location.kind === '命令菜单'
      ? (values(await query(`${key}\\command`)).get('(Default)') || '')
      : defaultValue
    const handler = location.kind === '扩展处理程序'
      ? await resolveHandler(defaultValue, keyName)
      : null
    const name = handler
      ? handler.name
      : cleanName(verb && verb !== '(value not set)' ? verb : keyName)
    const filePath = handler?.filePath || extractFilePath(command) || extractFilePath(keyValues.get('Icon') || '')
    return {
      id: idFor(key),
      name,
      keyName,
      target: location.target,
      scope: (location.hive === 'HKCU' ? '当前用户' : '所有用户') as MenuScope,
      kind: location.kind,
      command,
      icon: keyValues.get('Icon') || '',
      filePath,
      registryPath: key,
      removable: !/^((open|opennewwindow|opennewprocess|explore|find|print|printto|runas))$/i.test(keyName)
    }
  }))
}

export async function scanContextMenus(): Promise<ContextMenuEntry[]> {
  if (process.platform !== 'win32') return []
  const settled = await Promise.all(LOCATIONS.map(scanLocation))
  const unique = new Map<string, ContextMenuEntry>()
  for (const entry of settled.flat()) unique.set(entry.id, entry)
  const entries = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  cache.clear()
  for (const entry of entries) cache.set(entry.id, entry)
  return entries
}

export function getEntryFilePath(id: string): string {
  return cache.get(id)?.filePath || ''
}

export async function addContextMenu(request: AddMenuRequest): Promise<void> {
  const name = request.name.trim()
  const executable = path.resolve(request.executable)
  const target = ADD_TARGETS[request.target]
  if (!name || name.length > 80) throw new Error('菜单名称应为 1 到 80 个字符。')
  if (!target) throw new Error('不支持的出现位置。')
  if (!existsSync(executable) || !/\.(?:exe|com|cmd|bat)$/i.test(executable)) throw new Error('请选择有效的可执行程序。')
  if (request.scope !== '当前用户' && request.scope !== '所有用户') throw new Error('不支持的作用范围。')

  const hive = request.scope === '当前用户' ? 'HKCU' : 'HKLM'
  const suffix = createHash('sha256').update(`${executable}|${request.target}`).digest('hex').slice(0, 12)
  const key = `${hive}\\Software\\Classes\\${target.path}\\ContextMenuManager_${suffix}`
  if (await query(key)) throw new Error('该程序已在所选位置创建过右键菜单。')

  try {
    await reg(['add', key, '/ve', '/d', name, '/f'])
    await reg(['add', key, '/v', 'Icon', '/t', 'REG_SZ', '/d', executable, '/f'])
    await reg(['add', `${key}\\command`, '/ve', '/d', `"${executable}" "${target.argument}"`, '/f'])
  } catch (error) {
    try { await reg(['delete', key, '/f']) } catch { /* 清理未完整写入的注册表项 */ }
    throw error
  }
}

const UNINSTALL_LOCATIONS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

const APP_PATH_LOCATIONS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths'
]

function installedApp(idSource: string, name: string, publisher: string, executableValue: string): InstalledApp | null {
  const executable = extractFilePath(executableValue)
  if (!executable || !/\.(?:exe|com|cmd|bat)$/i.test(executable)) return null
  const fileName = path.basename(executable)
  if (/(?:unins(?:tall)?|installer|setup|update|crashpad|helper)/i.test(fileName)) return null
  return {
    id: createHash('sha256').update(idSource.toLowerCase()).digest('hex').slice(0, 20),
    name: cleanName(name) || fileName.replace(/\.[^.]+$/, ''),
    publisher: publisher.trim(),
    executable
  }
}

export async function scanInstalledApps(): Promise<InstalledApp[]> {
  const apps = new Map<string, InstalledApp>()
  for (const base of UNINSTALL_LOCATIONS) {
    const keys = childKeys(await query(base), base)
    const records = await Promise.all(keys.map(async (key) => {
      const record = values(await query(key))
      const name = record.get('DisplayName') || ''
      const icon = record.get('DisplayIcon') || ''
      return name ? installedApp(icon || key, name, record.get('Publisher') || '', icon) : null
    }))
    for (const app of records) if (app) apps.set(app.executable.toLowerCase(), app)
  }
  for (const base of APP_PATH_LOCATIONS) {
    const keys = childKeys(await query(base), base)
    const records = await Promise.all(keys.map(async (key) => {
      const record = values(await query(key))
      const executable = record.get('(Default)') || ''
      const fileName = key.split('\\').pop() || ''
      return installedApp(executable || key, fileName.replace(/\.[^.]+$/, ''), '', executable)
    }))
    for (const app of records) {
      if (!app) continue
      const existing = apps.get(app.executable.toLowerCase())
      apps.set(app.executable.toLowerCase(), existing || app)
    }
  }
  const result = [...apps.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  installedAppCache.clear()
  for (const app of result) installedAppCache.set(app.id, app)
  return result
}

export async function addInstalledContextMenus(request: AddInstalledRequest): Promise<AddInstalledResult> {
  const ids = [...new Set(request.ids)]
  if (!ids.length || ids.some((id) => !installedAppCache.has(id))) throw new Error('软件列表已失效，请重新打开新增窗口。')
  const result: AddInstalledResult = { added: [], failed: [] }
  for (const id of ids) {
    const app = installedAppCache.get(id)!
    try {
      await addContextMenu({ name: app.name, executable: app.executable, target: request.target, scope: request.scope })
      result.added.push(app.name)
    } catch (error) {
      result.failed.push({ name: app.name, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}

function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80) || 'menu-item'
}

export async function removeContextMenus(ids: string[], backupRoot: string): Promise<RemoveResult> {
  const uniqueIds = [...new Set(ids)]
  const entries = uniqueIds.map((id) => cache.get(id)).filter((e): e is ContextMenuEntry => Boolean(e))
  if (entries.length !== uniqueIds.length || entries.length === 0) {
    throw new Error('项目列表已失效，请重新扫描后再试。')
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDirectory = path.join(backupRoot, timestamp)
  await mkdir(backupDirectory, { recursive: true })
  const result: RemoveResult = { success: true, removed: [], failed: [], backupDirectory }
  const backupItems: Array<BackupItem & { registryPath: string; fileName: string }> = []

  for (const entry of entries) {
    if (!entry.removable) {
      result.failed.push({ name: entry.name, reason: '这是 Windows 内置菜单，已阻止移除。' })
      continue
    }
    try {
      const backupPath = path.join(backupDirectory, `${safeFileName(entry.name)}-${entry.id}.reg`)
      await reg(['export', entry.registryPath, backupPath, '/y'])
      await reg(['delete', entry.registryPath, '/f'])
      result.removed.push(entry.name)
      backupItems.push({ id: entry.id, name: entry.name, scope: entry.scope, target: entry.target, registryPath: entry.registryPath, fileName: path.basename(backupPath) })
      cache.delete(entry.id)
    } catch (error) {
      const reason = error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error)
      result.failed.push({ name: entry.name, reason })
    }
  }
  if (backupItems.length) {
    const manifest = {
      version: 1,
      name: `右键菜单备份（${backupItems.length} 项）`,
      createdAt: new Date().toISOString(),
      items: backupItems
    }
    try {
      await writeFile(path.join(backupDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    } catch {
      // .reg 文件已完整保存；即使清单写入失败，恢复列表仍可按旧备份格式识别。
    }
  }
  result.success = result.failed.length === 0
  return result
}

interface BackupManifest {
  name?: string
  createdAt?: string
  items?: Array<BackupItem & { fileName?: string }>
}

async function readBackupDirectory(directory: string, id: string): Promise<{ summary: BackupSummary; items: Array<BackupItem & { filePath: string }> } | null> {
  let manifest: BackupManifest = {}
  try { manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as BackupManifest } catch { /* 兼容旧备份 */ }
  const files = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.reg'))
  if (!files.length) return null
  const fileMap = new Map(files.map((file) => [file.name.toLowerCase(), file.name]))
  const manifestItems = Array.isArray(manifest.items) ? manifest.items : []
  const items = manifestItems.length
    ? manifestItems.flatMap((item) => {
        const fileName = item.fileName && fileMap.get(item.fileName.toLowerCase())
        return fileName ? [{ id: item.id, name: item.name, scope: item.scope || '', target: item.target || '', filePath: path.join(directory, fileName) }] : []
      })
    : files.map((file) => {
        const name = file.name.replace(/-[0-9a-f]{20}\.reg$/i, '').replace(/\.reg$/i, '')
        return { id: idFor(`${id}|${file.name}`), name, scope: '', target: '', filePath: path.join(directory, file.name) }
      })
  if (!items.length) return null
  const info = await stat(directory)
  const createdAt = manifest.createdAt && !Number.isNaN(Date.parse(manifest.createdAt)) ? manifest.createdAt : info.mtime.toISOString()
  return {
    summary: { id, name: manifest.name || `右键菜单备份（${items.length} 项）`, createdAt, count: items.length },
    items
  }
}

export async function listBackups(backupRoot: string): Promise<BackupSummary[]> {
  await mkdir(backupRoot, { recursive: true })
  const directories = (await readdir(backupRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory())
  const records = await Promise.all(directories.map((entry) => readBackupDirectory(path.join(backupRoot, entry.name), entry.name)))
  backupCache.clear()
  for (const record of records) if (record) backupCache.set(record.summary.id, record)
  return [...backupCache.values()].map((record) => record.summary).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getBackupDetail(id: string): BackupDetail {
  const record = backupCache.get(id)
  if (!record) throw new Error('备份列表已失效，请重新打开恢复窗口。')
  return { ...record.summary, items: record.items.map(({ filePath: _filePath, ...item }) => item) }
}

export async function restoreBackupItems(backupId: string, itemIds: string[]): Promise<RestoreResult> {
  const record = backupCache.get(backupId)
  if (!record) throw new Error('备份列表已失效，请重新打开恢复窗口。')
  const ids = [...new Set(itemIds)]
  const items = ids.map((id) => record.items.find((item) => item.id === id)).filter((item): item is BackupItem & { filePath: string } => Boolean(item))
  if (!items.length || items.length !== ids.length) throw new Error('恢复项目无效，请重新选择。')
  const result: RestoreResult = { restored: [], failed: [] }
  for (const item of items) {
    try {
      await reg(['import', item.filePath])
      result.restored.push(item.name)
    } catch (error) {
      result.failed.push({ name: item.name, reason: error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error) })
    }
  }
  return result
}
