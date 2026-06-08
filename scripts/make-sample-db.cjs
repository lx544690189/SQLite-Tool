// 生成多组示例 SQLite 文件，并验证 sql.js 字节注入式加载 + 表浏览查询逻辑
const initSqlJs = require('sql.js');
const fs = require('node:fs');
const path = require('node:path');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'db');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath) {
  ensureDir(dirPath);
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isFile()) {
      fs.unlinkSync(path.join(dirPath, entry.name));
    }
  }
}

function escapeText(value) {
  return String(value).replace(/'/g, "''");
}

function repeatText(seed, times) {
  return Array.from({ length: times }, (_, index) => `${seed}-${index + 1}`).join(' | ');
}

function createWideColumnDefinitions() {
  const columns = ['id INTEGER PRIMARY KEY'];
  for (let i = 1; i <= 22; i++) {
    columns.push(`metric_${String(i).padStart(2, '0')} TEXT`);
  }
  columns.push(
    'super_extraordinarily_long_column_name_for_table_grid_horizontal_scroll_and_header_wrapping_demo TEXT',
    'another_absurdly_verbose_column_name_to_validate_schema_rendering_and_query_panel_alignment TEXT',
  );
  return columns;
}

function insertUsers(db, count) {
  const stmt = db.prepare('INSERT INTO users (name, email, age, bio, joined_at, is_vip, tags) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (let i = 1; i <= count; i++) {
    stmt.run([
      `用户${i}`,
      `user${i}@example.com`,
      18 + (i % 45),
      i % 9 === 0 ? repeatText(`用户${i}的超长简介`, 24) : `简介-${i}`,
      `2026-06-${String((i % 28) + 1).padStart(2, '0')} 10:${String(i % 60).padStart(2, '0')}:00`,
      i % 5 === 0 ? 1 : 0,
      i % 3 === 0 ? '开发,测试,分析' : '普通用户',
    ]);
  }
  stmt.free();
}

function insertPosts(db, count) {
  const stmt = db.prepare('INSERT INTO posts (id, user_id, title, content, status, view_count) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 1; i <= count; i++) {
    stmt.run([
      i,
      ((i - 1) % 120) + 1,
      `文章标题 ${i}`,
      i % 10 === 0 ? repeatText(`第${i}篇文章的超长内容`, 40) : `正文-${i}`,
      i % 4 === 0 ? 'archived' : i % 3 === 0 ? 'draft' : 'published',
      i * 37,
    ]);
  }
  stmt.free();
}

function populateMixedDatabase(db) {
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      age INTEGER,
      bio TEXT,
      joined_at TEXT,
      is_vip INTEGER DEFAULT 0,
      tags TEXT
    );

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      title TEXT,
      content TEXT,
      status TEXT,
      view_count INTEGER DEFAULT 0
    );

    CREATE TABLE weird_names (
      id INTEGER PRIMARY KEY,
      "this_is_an_extremely_long_column_name_used_to_test_table_header_layout_and_schema_panel_overflow_handling_in_the_editor" TEXT,
      "包含空格 的列名 与 特殊展示需求" TEXT,
      notes TEXT
    );
  `);

  insertUsers(db, 120);
  insertPosts(db, 160);
  db.run(`
    INSERT INTO weird_names (
      id,
      "this_is_an_extremely_long_column_name_used_to_test_table_header_layout_and_schema_panel_overflow_handling_in_the_editor",
      "包含空格 的列名 与 特殊展示需求",
      notes
    ) VALUES
      (1, '超长列名样例', '值A', '${escapeText(repeatText('用于测试表头滚动和 schema 展示的备注', 18))}'),
      (2, '带引号 '' quote', '值B', NULL);
  `);
}

function populateWideDatabase(db) {
  db.run(`CREATE TABLE analytics_wide (${createWideColumnDefinitions().join(',\n')});`);

  const columnNames = ['id'];
  for (let i = 1; i <= 22; i++) {
    columnNames.push(`metric_${String(i).padStart(2, '0')}`);
  }
  columnNames.push(
    'super_extraordinarily_long_column_name_for_table_grid_horizontal_scroll_and_header_wrapping_demo',
    'another_absurdly_verbose_column_name_to_validate_schema_rendering_and_query_panel_alignment',
  );

  const placeholders = columnNames.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO analytics_wide (${columnNames.join(', ')}) VALUES (${placeholders})`);

  for (let row = 1; row <= 36; row++) {
    const values = [row];
    for (let col = 1; col <= 22; col++) {
      values.push(`r${row}-c${col}-${row % 2 === 0 ? '偶数行' : '奇数行'}`);
    }
    values.push(`超长表头值-${row}`);
    values.push(row % 7 === 0 ? repeatText(`宽表第${row}行的超长单元格`, 16) : `普通备注-${row}`);
    stmt.run(values);
  }

  stmt.free();
}

function populateLargeDatabase(db) {
  db.run(`
    CREATE TABLE event_logs (
      id INTEGER PRIMARY KEY,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL,
      payload_json TEXT,
      request_id TEXT,
      duration_ms INTEGER
    );
  `);

  const stmt = db.prepare(`
    INSERT INTO event_logs (
      id, level, source, message, created_at, payload_json, request_id, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 1; i <= 5200; i++) {
    stmt.run([
      i,
      i % 17 === 0 ? 'error' : i % 5 === 0 ? 'warn' : 'info',
      i % 2 === 0 ? 'sync-worker' : 'query-runner',
      i % 333 === 0 ? repeatText(`第${i}条日志的超长 message`, 32) : `日志消息-${i}`,
      `2026-06-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:30Z`,
      JSON.stringify({
        action: i % 4 === 0 ? 'refresh' : 'open',
        page: i % 300,
        ok: i % 17 !== 0,
        nested: {
          batch: Math.floor(i / 100),
          flags: [i % 2 === 0, i % 3 === 0, i % 5 === 0],
        },
      }),
      `req-${String(i).padStart(6, '0')}`,
      20 + (i % 900),
    ]);
  }

  stmt.free();
}

function verifyDatabase(SQL, bytes, expected) {
  const reopened = new SQL.Database(new Uint8Array(bytes));

  const tablesResult = reopened.exec(`
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  const tables = tablesResult[0]?.values.map((row) => row[0]) ?? [];

  const countResult = reopened.exec(`SELECT COUNT(*) FROM "${expected.table}"`);
  const rowCount = countResult[0]?.values?.[0]?.[0] ?? 0;

  const pageResult = reopened.exec(`SELECT * FROM "${expected.table}" LIMIT 10 OFFSET 10`);
  const pageRows = pageResult[0]?.values?.length ?? 0;
  const columnCount = pageResult[0]?.columns?.length ?? 0;

  const schemaResult = reopened.exec(`PRAGMA table_info("${expected.table}")`);
  const schemaRows = schemaResult[0]?.values ?? [];
  const longestColumnName = schemaRows.reduce((max, row) => {
    const name = String(row[1] ?? '');
    return name.length > max.length ? name : max;
  }, '');

  reopened.close();

  if (rowCount !== expected.rowCount) {
    throw new Error(`${expected.fileName} 校验失败：期望 ${expected.rowCount} 行，实际 ${rowCount} 行`);
  }

  return {
    fileName: expected.fileName,
    tables,
    rowCount,
    pageRows,
    columnCount,
    longestColumnNameLength: longestColumnName.length,
  };
}

async function buildOne(SQL, config) {
  const db = new SQL.Database();
  config.populate(db);

  const bytes = db.export();
  db.close();

  const outPath = path.join(OUTPUT_DIR, config.fileName);
  fs.writeFileSync(outPath, Buffer.from(bytes));

  return verifyDatabase(SQL, bytes, config);
}

(async () => {
  const SQL = await initSqlJs();
  resetDir(OUTPUT_DIR);

  const configs = [
    {
      fileName: 'sample-mixed.db',
      table: 'users',
      rowCount: 120,
      populate: populateMixedDatabase,
    },
    {
      fileName: 'sample-wide.sqlite',
      table: 'analytics_wide',
      rowCount: 36,
      populate: populateWideDatabase,
    },
    {
      fileName: 'sample-large.sqlite3',
      table: 'event_logs',
      rowCount: 5200,
      populate: populateLargeDatabase,
    },
  ];

  const results = [];
  for (const config of configs) {
    results.push(await buildOne(SQL, config));
  }

  console.log(`输出目录: ${OUTPUT_DIR}`);
  for (const result of results) {
    console.log(
      [
        `- ${result.fileName}`,
        `表=${result.tables.join(', ')}`,
        `主表行数=${result.rowCount}`,
        `分页行数=${result.pageRows}`,
        `列数=${result.columnCount}`,
        `最长列名长度=${result.longestColumnNameLength}`,
      ].join(' | '),
    );
  }
  console.log('✅ 已生成 3 种扩展名样本库，覆盖大数据量 / 宽表 / 超长列名 / 超长文本场景');
})().catch((error) => {
  console.error('生成失败:', error);
  process.exitCode = 1;
});
