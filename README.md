# Windows 右键菜单管理器

基于 Vue 3、TypeScript 和 Electron 开发的 Windows 桌面工具，用于查看、新增、取消及恢复资源管理器右键菜单集成。

## 功能特性

- 扫描“当前用户”和“所有用户”的右键菜单
- 支持文件、文件夹、文件夹空白处、磁盘及桌面空白处
- 识别普通 Shell 命令和 `ContextMenuHandler` 扩展
- 按名称、命令或位置搜索，并按作用范围筛选
- 自动读取 Windows 已安装软件，勾选后批量新增右键菜单
- 定位右键菜单对应的 EXE 或 DLL 文件
- 批量取消右键菜单集成，操作前自动导出 `.reg` 备份
- 按备份名称和时间查看历史记录，选择指定项目恢复
- 保护常见 Windows 内置菜单，降低误操作风险
- 兼容中文 Windows 注册表的 CP936/GBK 输出

> 本工具只修改所选右键菜单的注册表入口，不会卸载软件，也不会删除软件本体或 COM 注册信息。

## 界面与权限

程序默认筛选“当前用户”项目。管理“所有用户”项目需要更高权限，请右键程序并选择“以管理员身份运行”。

备份默认保存在：

```text
文档\右键菜单管理器\备份
```

每次取消集成都会生成独立备份目录，其中包含 `.reg` 文件和备份清单。恢复操作不会删除原备份，可重复使用。

## 技术栈

- Vue 3
- TypeScript
- Vite
- Electron
- electron-builder

渲染进程仅负责界面展示，通过受限 IPC 调用主进程；注册表读取、写入、备份和恢复均在 Electron 主进程中执行。

## 环境要求

- Windows 10 或 Windows 11（x64）
- Node.js 18 或更高版本
- npm

注册表相关功能仅支持 Windows。在其他系统上可以构建前端，但无法执行扫描和修改操作。

## 本地开发

```powershell
cd "D:\Codex\其他\windows-context-menu-manager"
npm install
npm run dev
```

如需测试“所有用户”范围的新增、取消或恢复功能，请以管理员身份启动 PowerShell。

## 常用命令

```powershell
# 启动开发环境
npm run dev

# 检查 Vue 与 Electron TypeScript 类型
npm run typecheck

# 构建安装版和便携版
npm run build

# 仅生成解包目录
npm run build:dir
```

## 打包产物

执行 `npm run build` 后，产物位于 `release` 目录：

```text
release/
├── 右键菜单管理器 Setup 1.0.0.exe   # NSIS 安装版
├── 右键菜单管理器 1.0.0.exe         # 便携版
└── win-unpacked/                     # 解包后的程序目录
```

构建配置已启用：

- ASAR 归档
- 最大压缩
- 仅保留简体中文和英文 Electron 语言资源
- 生产文件白名单
- EXE 简体中文版本资源
- 中文产品名称、文件说明及版权信息

由于应用未配置商业代码签名证书，Windows 可能显示“未知发布者”提示。

## 项目结构

```text
windows-context-menu-manager/
├── electron/
│   ├── main.ts              # Electron 主进程与 IPC
│   ├── preload.ts           # 安全的渲染进程桥接 API
│   ├── registry.ts          # 注册表扫描、修改、备份和恢复
│   └── types.ts             # 主进程共享类型
├── scripts/
│   ├── after-pack.cjs       # 打包后处理主程序资源
│   ├── exe-language.cjs     # EXE 中文版本资源处理
│   └── set-exe-language.cjs # 最终产物资源处理
├── src/
│   ├── App.vue              # 主界面与交互逻辑
│   ├── env.d.ts             # 渲染进程类型声明
│   ├── main.ts              # Vue 入口
│   └── style.css            # 界面样式
├── package.json
└── vite.config.ts
```

## 安全设计

- 启用 `contextIsolation`，关闭渲染进程的 Node.js 集成
- 渲染进程不能执行任意系统命令或直接访问注册表
- 删除操作只接受最近一次扫描得到的项目 ID
- 恢复操作只接受应用扫描到的备份批次和备份项目 ID
- 删除前逐项导出注册表，失败项目不会被标记为成功
- 新增集成仅接受系统已识别且实际存在的可执行程序

## 注意事项

- 修改注册表存在系统风险，请保留自动生成的备份。
- 部分 Windows 11 新式菜单由系统组件或应用内部机制管理，可能不会出现在传统 Shell 注册表位置。
- 某些扩展处理程序无法解析到明确的 EXE 或 DLL，因此不会显示“打开位置”。
- 恢复机器级备份或修改“所有用户”项目时，需要管理员权限。

## 功能图片
![右键菜单管理器.png](https://geshanzsq.com/geshanzsq-file/profile/image/2026/07/06/92314617-ba4e-4022-89ac-9a33fdb10b28.png)

## 许可证

本项目基于 [MIT License](LICENSE) 开源，版权所有 © 2026 geshanzsq。
