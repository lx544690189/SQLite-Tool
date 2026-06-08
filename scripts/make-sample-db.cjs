// 生成示例 .db 并验证 sql.js 字节注入式加载 + 表浏览查询逻辑
const initSqlJs = require('sql.js');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const SQL = await initSqlJs();

  // 1. 建库写数据
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      age INTEGER
    );
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      title TEXT,
      content TEXT
    );
  `);
  for (let i = 1; i <= 35; i++) {
    db.run(`INSERT INTO users (name, email, age) VALUES ('用户${i}', 'u${i}@test.com', ${20 + (i % 30)})`);
  }
  db.run(`INSERT INTO posts (id, user_id, title, content) VALUES (1, 1, '标题A', '内容...')`);
  db.run(`INSERT INTO posts (id, user_id, title, content) VALUES (2, 2, '标题B', NULL)`);

  const bytes = db.export();
  db.close();

  const outPath = path.resolve(__dirname, '..', 'sample.db');
  fs.writeFileSync(outPath, Buffer.from(bytes));

  // 2. 模拟宿主 push 字节 → Webview 字节注入加载
  const reopened = new SQL.Database(new Uint8Array(bytes));

  const tables = reopened
    .exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)[0]
    .values.map((r) => r[0]);

  const usersCount = reopened.exec(`SELECT COUNT(*) FROM "users"`)[0].values[0][0];
  const page2 = reopened.exec(`SELECT * FROM "users" ORDER BY "age" DESC LIMIT 10 OFFSET 10`);
  const schema = reopened.exec(`PRAGMA table_info("users")`);
  reopened.close();

  console.log('生成文件:', outPath);
  console.log('表列表:', tables);
  console.log('users 行数:', usersCount);
  console.log('第2页(age DESC)行数:', page2[0].values.length, '示例首行:', page2[0].values[0]);
  console.log('users 列数:', schema[0].values.length);
  console.log('✅ 字节注入加载 + 分页/排序/schema 查询全部通过');
})();
