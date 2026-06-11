# sqlite-tool

中文 | [English](README.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

sqlite-tool 是一个 VS Code SQLite 数据库可视化工具。打开 `.db`、`.sqlite` 或 `.sqlite3` 文件后，可以直接在编辑器里浏览表结构、查看和编辑数据、创建表，并执行 SQL。

## 功能

- 直接以自定义编辑器打开 SQLite 数据库文件，无需额外配置。
- 浏览表列表、表数据、行数、分页结果和排序结果。
- 支持按全部字段或指定字段搜索数据。
- 新增、编辑、删除行，支持 NULL、主键保护和二次删除确认。
- 查看建表 SQL、重命名表、通过表单创建新表。
- 使用 Monaco SQL 编辑器执行查询和写入语句，并查看结果与历史记录。
- 跟随 VS Code 明暗主题，也可以在工具内手动切换主题。
- 使用 VS Code 原生脏标记和 `Ctrl/Cmd+S` 保存流程写回磁盘。

## 安装

如果你拿到的是 `.vsix` 文件，可以在 VS Code 中运行：

```bash
code --install-extension sqlite-tool-0.0.1.vsix
```

也可以在 VS Code 的扩展面板中选择“从 VSIX 安装...”。

## 使用

1. 在 VS Code 资源管理器中打开任意 `.db`、`.sqlite` 或 `.sqlite3` 文件。
2. 文件会自动以 `sqlite-tool` 编辑器打开。
3. 在左侧选择表，浏览、搜索或编辑数据。
4. 需要执行 SQL 时切换到 SQL 执行器。
5. 数据发生变化后，编辑器标签会显示未保存状态，按 `Ctrl/Cmd+S` 写回数据库文件。

## 设置

sqlite-tool 支持界面语言设置：

- `Auto`：跟随 VS Code 显示语言。
- `Chinese` / `English` / `French` / `Japanese` / `Korean`：手动指定语言。

可以在 VS Code 设置中搜索 `sqlite-tool`，或在工具内打开设置面板调整语言、主题、默认分页条数和 SQL 编辑器字号。

## 注意事项

- 修改数据库前建议先确认文件来源，重要数据库请保留备份。
- 对没有主键且不支持 `rowid` 的表，工具只提供浏览能力，不支持行级编辑或删除。
- 如果文件在外部被修改，保存前会提示冲突风险，避免覆盖外部变更。

## 开发者文档

开发、架构、自检和打包说明已经整理到 [docs/开发者指南.md](docs/开发者指南.md)。

## License

MIT
