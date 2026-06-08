# SQLite 管理器（SQLite Manager for VSCode）

在 VSCode 中**点击 `.db` / `.sqlite` / `.sqlite3` 文件即可可视化浏览与编辑 SQLite 数据库**：表数据浏览、增删改查、新建表、执行 SQL，全部走 VSCode 原生的脏标记与保存流程。

## ✨ 功能

- **自定义编辑器**：点击 SQLite 文件 → 打开可视化管理界面（无需配置）。
- **表管理**
  - 侧边栏表列表（含每张表行数）。
  - 表数据浏览：表格 + 分页（10/20/50/100）+ 排序。
  - 数据搜索：全部字段 / 指定字段关键字搜索。
  - 增删改：新增行（智能表单、类型适配、NULL、主键保护）、双击行内编辑、删除行（二次确认）。
  - 查看建表 SQL、重命名表。
  - 新建表面板（字段表单 → SQL 预览 → 执行）。
- **SQL 执行器**：基于 Monaco 的 SQL 编辑器，执行查询/写操作，结果表格展示，保留执行历史（`Ctrl/Cmd+Enter` 执行）。
- **主题**：默认跟随 VSCode 明暗主题，支持手动切换。
- **保存模型**：VSCode 原生脏标记 + `Ctrl/Cmd+S` 写回磁盘，支持撤销（revert）与热退出备份。

## 🚀 使用

1. 在 VSCode 资源管理器中点击任意 `.db` / `.sqlite` / `.sqlite3` 文件。
2. 自动以「SQLite 管理器」自定义编辑器打开。
3. 浏览/编辑数据，标题栏出现脏标记圆点后按 `Ctrl/Cmd+S` 保存。

## 🛠️ 开发

```bash
npm install          # 安装依赖
npm run build        # 构建 Webview(→ media/) 与扩展宿主(→ dist/)
npm run dev:webview  # Webview Vite HMR 开发服务器
npm run watch:ext    # 扩展宿主监听构建
# 如需监听构建产物而非 HMR
npm run watch:webview
```

在 VSCode 中按 `F5` 启动 **Extension Development Host**：

- 选择 `运行扩展（热更新）`：自动启动 Vite HMR + 宿主 watch。修改 `webview/src/**` 后，当前打开的数据库页面会热更新，无需重新 build。
- 选择 `运行扩展`：走原来的构建产物模式。

说明：

- `webview` 前端代码支持热更新。
- `src/**` 扩展宿主代码变更后会自动重新编译到 `dist/`，但仍需在 Extension Development Host 中执行一次“开发人员: 重新加载窗口”或重新 F5，VSCode 扩展宿主本身不支持真正意义上的无感热替换。

生成测试数据库：

```bash
npm run sample:db   # 生成 db/ 目录下的 3 份样本库
```

生成结果默认输出到 `db/`（已加入 `.gitignore`），包含：

- `sample-mixed.db`：常规混合场景，含多表、超长列名、超长文本、NULL、带空格列名。
- `sample-wide.sqlite`：宽表场景，25 列，覆盖横向滚动与长表头展示。
- `sample-large.sqlite3`：大数据量场景，`event_logs` 表 5200 行，含长文本与 JSON 文本列。

逻辑自检脚本（无需 VSCode）：

```bash
node scripts/verify-mutations.cjs  # 增删改 + 字节回写
node scripts/verify-m3.cjs         # 建表 / 重命名 / SQL 分类
```

## 🏗️ 架构

```
扩展宿主 (Node)  ── postMessage ──  Webview (Chromium 沙箱)
SqliteEditorProvider                React 19 + Ant Design 6
SqliteDocument(字节模型)            sql.js(WASM 内存库) + Monaco
文件 IO / 脏标记 / 保存 / 备份       bridge.ts(异步桥) + SQLiteHelper
```

- **宿主**：唯一碰磁盘的一方，负责把字节交给 Webview、接收变更回写、参与脏标记/保存/撤销/备份生命周期。
- **Webview**：所有业务逻辑与 UI，用 sql.js 在内存加载与操作数据库，变更后导出字节回传宿主。

详见 `docs/开发计划.md` 与 `docs/实施方案.md`。

## 📦 打包

```bash
npm run package      # vsce package → .vsix
```

## License

MIT
