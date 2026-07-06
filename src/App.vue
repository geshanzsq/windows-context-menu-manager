<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const entries = ref<ContextMenuEntry[]>([])
const selected = ref(new Set<string>())
const loading = ref(false)
const removing = ref(false)
const query = ref('')
const scope = ref('当前用户')
const notice = ref<{ kind: 'success' | 'error'; text: string; path?: string } | null>(null)
const addVisible = ref(false)
const adding = ref(false)
const appsLoading = ref(false)
const installedApps = ref<InstalledApp[]>([])
const selectedApps = ref(new Set<string>())
const appQuery = ref('')
const addOptions = ref<Pick<AddInstalledRequest, 'target' | 'scope'>>({ target: '所有文件', scope: '当前用户' })
const backupVisible = ref(false)
const backupsLoading = ref(false)
const restoring = ref(false)
const backups = ref<BackupSummary[]>([])
const backupDetail = ref<BackupDetail | null>(null)
const selectedRestore = ref(new Set<string>())

const filtered = computed(() => entries.value.filter((item) => {
  const q = query.value.trim().toLocaleLowerCase()
  const matchesText = !q || [item.name, item.command, item.target, item.keyName].some((x) => x.toLocaleLowerCase().includes(q))
  return matchesText && (scope.value === '全部范围' || item.scope === scope.value)
}))
const removableFiltered = computed(() => filtered.value.filter((item) => item.removable))
const allChecked = computed(() => removableFiltered.value.length > 0 && removableFiltered.value.every((item) => selected.value.has(item.id)))
const filteredApps = computed(() => {
  const q = appQuery.value.trim().toLocaleLowerCase()
  const integratedPaths = new Set(entries.value
    .filter((entry) => entry.target === addOptions.value.target && entry.filePath)
    .map((entry) => entry.filePath.toLocaleLowerCase()))
  return installedApps.value.filter((app) => {
    const notIntegrated = !integratedPaths.has(app.executable.toLocaleLowerCase())
    const matchesSearch = !q || [app.name, app.publisher, app.executable].some((value) => value.toLocaleLowerCase().includes(q))
    return notIntegrated && matchesSearch
  })
})

watch(() => addOptions.value.target, () => { selectedApps.value = new Set() })

async function scan() {
  loading.value = true
  notice.value = null
  selected.value = new Set()
  try {
    entries.value = await window.contextMenuApi.scan()
  } catch (error) {
    notice.value = { kind: 'error', text: `扫描失败：${error instanceof Error ? error.message : String(error)}` }
  } finally { loading.value = false }
}

function toggle(id: string) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}

function toggleAll() {
  const next = new Set(selected.value)
  if (allChecked.value) removableFiltered.value.forEach((item) => next.delete(item.id))
  else removableFiltered.value.forEach((item) => next.add(item.id))
  selected.value = next
}

async function removeSelected() {
  const count = selected.value.size
  if (!count || !window.confirm(`确定取消选中的 ${count} 项右键菜单集成吗？\n\n操作前会自动导出注册表备份。`)) return
  removing.value = true
  notice.value = null
  try {
    const result = await window.contextMenuApi.remove([...selected.value])
    const failed = result.failed.map((x) => `${x.name}：${x.reason}`).join('；')
    notice.value = result.success
      ? { kind: 'success', text: `已取消 ${result.removed.length} 项集成，并完成备份。`, path: result.backupDirectory }
      : { kind: 'error', text: `已取消 ${result.removed.length} 项，${result.failed.length} 项失败。${failed}`, path: result.backupDirectory }
    await scanAfterRemove(result)
  } catch (error) {
    notice.value = { kind: 'error', text: `操作失败：${error instanceof Error ? error.message : String(error)}` }
  } finally { removing.value = false }
}

async function scanAfterRemove(result: RemoveResult) {
  const savedNotice = notice.value
  entries.value = await window.contextMenuApi.scan()
  selected.value = new Set()
  notice.value = savedNotice
  if (result.backupDirectory) notice.value!.path = result.backupDirectory
}

function showBackup(path: string) {
  void window.contextMenuApi.showPath(path)
}

function showFile(id: string) {
  void window.contextMenuApi.showFile(id)
}

async function openAddDialog() {
  selectedApps.value = new Set()
  appQuery.value = ''
  addOptions.value = { target: '所有文件', scope: '当前用户' }
  addVisible.value = true
  appsLoading.value = true
  try {
    installedApps.value = await window.contextMenuApi.installedApps()
  } catch (error) {
    notice.value = { kind: 'error', text: `读取已安装软件失败：${error instanceof Error ? error.message : String(error)}` }
    addVisible.value = false
  } finally { appsLoading.value = false }
}

function toggleApp(id: string) {
  const next = new Set(selectedApps.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedApps.value = next
}

async function submitAdd() {
  if (!selectedApps.value.size) return
  adding.value = true
  try {
    const result = await window.contextMenuApi.addInstalled({ ids: [...selectedApps.value], ...addOptions.value })
    addVisible.value = false
    await scan()
    notice.value = result.failed.length
      ? { kind: 'error', text: `成功新增 ${result.added.length} 项，失败 ${result.failed.length} 项：${result.failed.map(x => `${x.name}（${x.reason}）`).join('；')}` }
      : { kind: 'success', text: `已成功新增 ${result.added.length} 项右键菜单集成。` }
  } catch (error) {
    notice.value = { kind: 'error', text: `新增失败：${error instanceof Error ? error.message : String(error)}` }
  } finally { adding.value = false }
}

function formatBackupTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

async function openBackups() {
  backupVisible.value = true
  backupDetail.value = null
  selectedRestore.value = new Set()
  backupsLoading.value = true
  try {
    backups.value = await window.contextMenuApi.listBackups()
  } catch (error) {
    notice.value = { kind: 'error', text: `读取备份失败：${error instanceof Error ? error.message : String(error)}` }
    backupVisible.value = false
  } finally { backupsLoading.value = false }
}

async function viewBackup(id: string) {
  backupsLoading.value = true
  try {
    backupDetail.value = await window.contextMenuApi.backupDetail(id)
    selectedRestore.value = new Set()
  } catch (error) {
    notice.value = { kind: 'error', text: `读取备份详情失败：${error instanceof Error ? error.message : String(error)}` }
  } finally { backupsLoading.value = false }
}

function toggleRestore(id: string) {
  const next = new Set(selectedRestore.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedRestore.value = next
}

function toggleAllRestore() {
  if (!backupDetail.value) return
  selectedRestore.value = selectedRestore.value.size === backupDetail.value.items.length
    ? new Set()
    : new Set(backupDetail.value.items.map((item) => item.id))
}

async function restoreSelected() {
  if (!backupDetail.value || !selectedRestore.value.size) return
  restoring.value = true
  try {
    const result = await window.contextMenuApi.restoreBackup(backupDetail.value.id, [...selectedRestore.value])
    backupVisible.value = false
    await scan()
    notice.value = result.failed.length
      ? { kind: 'error', text: `成功恢复 ${result.restored.length} 项，失败 ${result.failed.length} 项：${result.failed.map(x => `${x.name}（${x.reason}）`).join('；')}` }
      : { kind: 'success', text: `已成功恢复 ${result.restored.length} 项右键菜单集成。` }
  } catch (error) {
    notice.value = { kind: 'error', text: `恢复失败：${error instanceof Error ? error.message : String(error)}` }
  } finally { restoring.value = false }
}

onMounted(scan)
</script>

<template>
  <main class="page">
    <header class="hero">
      <div class="app-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div class="title-block">
        <h1>右键菜单管理器</h1>
        <p>查看并安全清理 Windows 资源管理器的右键集成</p>
      </div>
      <button class="ghost-button" :disabled="loading || removing" @click="scan">
        <span class="refresh" :class="{ spin: loading }">↻</span> 重新扫描
      </button>
    </header>

    <section class="summary">
      <div><strong>{{ entries.length }}</strong><span>检测到的集成</span></div>
      <i></i>
      <div><strong>{{ entries.filter(x => x.scope === '当前用户').length }}</strong><span>当前用户</span></div>
      <i></i>
      <div><strong>{{ entries.filter(x => x.scope === '所有用户').length }}</strong><span>所有用户</span></div>
      <div class="safe-note"><span>✓</span> 删除前自动备份注册表</div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <label class="search"><span>⌕</span><input v-model="query" placeholder="搜索软件、命令或位置" /></label>
        <select v-model="scope" aria-label="集成范围">
          <option>全部范围</option><option>当前用户</option><option>所有用户</option>
        </select>
        <button class="backup-button" :disabled="removing" @click="openBackups">↶ 恢复备份</button>
        <button class="add-button" :disabled="removing" @click="openAddDialog">＋ 新增集成</button>
        <button class="danger-button" :disabled="selected.size === 0 || removing" @click="removeSelected">
          {{ removing ? '正在处理…' : `取消集成${selected.size ? ` (${selected.size})` : ''}` }}
        </button>
      </div>

      <div v-if="notice" class="notice" :class="notice.kind">
        <span>{{ notice.kind === 'success' ? '✓' : '!' }}</span>
        <p>{{ notice.text }}</p>
        <button v-if="notice.path" @click="showBackup(notice.path)">查看备份</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr>
            <th class="check"><input type="checkbox" :checked="allChecked" :disabled="!removableFiltered.length" @change="toggleAll" /></th>
            <th>软件 / 菜单项</th><th>出现位置</th><th>类型</th><th>范围</th><th>执行命令</th>
          </tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="6" class="empty"><span class="loader"></span>正在扫描注册表…</td></tr>
            <tr v-else-if="!filtered.length"><td colspan="6" class="empty">没有找到匹配的右键菜单集成</td></tr>
            <tr v-for="item in filtered" v-else :key="item.id" :class="{ selected: selected.has(item.id), protected: !item.removable }">
              <td class="check"><input type="checkbox" :checked="selected.has(item.id)" :disabled="!item.removable" @change="toggle(item.id)" /></td>
              <td><div class="menu-name"><span class="item-icon">{{ item.kind === '命令菜单' ? '▣' : '⌘' }}</span><div><b :title="item.name">{{ item.name }}</b><small :title="item.keyName">{{ item.keyName }}</small></div></div></td>
              <td><div class="target-cell"><span class="target-pill">{{ item.target }}</span><button v-if="item.filePath" :title="item.filePath" @click="showFile(item.id)">打开位置</button></div></td>
              <td>{{ item.kind }}</td>
              <td><span class="scope-dot" :class="item.scope === '所有用户' ? 'machine' : 'user'"></span>{{ item.scope }}</td>
              <td class="command" :title="item.command || item.registryPath">{{ item.command || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer><span>已显示 {{ filtered.length }} 项</span><span>灰色项目为 Windows 内置菜单，受保护不可移除</span></footer>
    </section>

    <div v-if="addVisible" class="modal-backdrop" @mousedown.self="addVisible = false">
      <form class="modal" @submit.prevent="submitAdd">
        <div class="modal-head"><div><h2>选择要添加的软件</h2><p>已自动读取 Windows 中安装的可执行程序，可多选</p></div><button type="button" aria-label="关闭" @click="addVisible = false">×</button></div>
        <label class="app-search"><span>⌕</span><input v-model="appQuery" placeholder="搜索软件名称、发布者或路径" /></label>
        <div class="app-list">
          <div v-if="appsLoading" class="app-list-state"><span class="loader"></span>正在读取已安装软件…</div>
          <div v-else-if="!filteredApps.length" class="app-list-state">没有找到可添加的软件</div>
          <label v-for="app in filteredApps" v-else :key="app.id" class="app-option" :class="{ checked: selectedApps.has(app.id) }">
            <input type="checkbox" :checked="selectedApps.has(app.id)" @change="toggleApp(app.id)" />
            <span class="app-option-icon">▣</span>
            <span class="app-option-info"><b>{{ app.name }}</b><small>{{ app.publisher || app.executable }}</small><em v-if="app.publisher">{{ app.executable }}</em></span>
          </label>
        </div>
        <div class="form-row">
          <label class="form-field"><span>出现位置</span><select v-model="addOptions.target"><option>所有文件</option><option>文件夹</option><option>文件夹空白处</option><option>磁盘</option><option>桌面空白处</option></select></label>
          <label class="form-field"><span>作用范围</span><select v-model="addOptions.scope"><option>当前用户</option><option>所有用户</option></select></label>
        </div>
        <p class="form-tip">新增“所有用户”项目时需要管理员权限。</p>
        <div class="modal-actions"><span>已选择 {{ selectedApps.size }} 项</span><button type="button" class="cancel" @click="addVisible = false">取消</button><button type="submit" class="confirm" :disabled="adding || !selectedApps.size">{{ adding ? '正在新增…' : '确认添加' }}</button></div>
      </form>
    </div>

    <div v-if="backupVisible" class="modal-backdrop" @mousedown.self="backupVisible = false">
      <section class="modal backup-modal">
        <div class="modal-head">
          <div><h2>{{ backupDetail ? '备份详情' : '恢复备份' }}</h2><p>{{ backupDetail ? `${backupDetail.name} · ${formatBackupTime(backupDetail.createdAt)}` : '选择一个备份批次查看上次取消的菜单列表' }}</p></div>
          <button type="button" aria-label="关闭" @click="backupVisible = false">×</button>
        </div>
        <div v-if="backupsLoading" class="backup-state"><span class="loader"></span>正在读取备份…</div>
        <template v-else-if="!backupDetail">
          <div v-if="!backups.length" class="backup-state">暂无可恢复的备份</div>
          <div v-else class="backup-list">
            <article v-for="backup in backups" :key="backup.id" class="backup-row">
              <span class="backup-icon">↶</span>
              <div><b>{{ backup.name }}</b><small>{{ formatBackupTime(backup.createdAt) }} · {{ backup.count }} 项</small></div>
              <button type="button" @click="viewBackup(backup.id)">查看详情</button>
            </article>
          </div>
          <div class="modal-actions"><button type="button" class="cancel" @click="backupVisible = false">关闭</button></div>
        </template>
        <template v-else>
          <div class="restore-head"><label><input type="checkbox" :checked="selectedRestore.size === backupDetail.items.length" @change="toggleAllRestore" /> 全选</label><span>共 {{ backupDetail.items.length }} 项</span></div>
          <div class="restore-list">
            <label v-for="item in backupDetail.items" :key="item.id" class="restore-row" :class="{ checked: selectedRestore.has(item.id) }">
              <input type="checkbox" :checked="selectedRestore.has(item.id)" @change="toggleRestore(item.id)" />
              <span><b>{{ item.name }}</b><small>{{ [item.target, item.scope].filter(Boolean).join(' · ') || '旧版备份项目' }}</small></span>
            </label>
          </div>
          <div class="modal-actions"><span>已选择 {{ selectedRestore.size }} 项</span><button type="button" class="cancel" @click="backupDetail = null; selectedRestore = new Set()">返回</button><button type="button" class="confirm" :disabled="restoring || !selectedRestore.size" @click="restoreSelected">{{ restoring ? '正在恢复…' : '确认恢复' }}</button></div>
        </template>
      </section>
    </div>
  </main>
</template>
