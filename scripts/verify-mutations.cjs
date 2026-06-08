// 验证 M2 增删改 + 导出回写字节的正确性（模拟 Webview 内存变更 → 宿主保存）
const initSqlJs = require('sql.js');
const assert = require('node:assert');

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, age INTEGER)`);
  db.run(`INSERT INTO users (name, age) VALUES ('A', 10), ('B', 20), ('C', 30)`);

  // rowid 策略检测
  let rowidOk = true;
  try {
    db.exec(`SELECT rowid FROM "users" LIMIT 1`);
  } catch {
    rowidOk = false;
  }
  assert.strictEqual(rowidOk, true, 'rowid 策略应可用');

  // INSERT（INTEGER PK 自增，跳过 id）
  db.run(`INSERT INTO "users" ("name", "age") VALUES ('D', 40)`);
  let count = db.exec(`SELECT COUNT(*) FROM users`)[0].values[0][0];
  assert.strictEqual(count, 4, '插入后应为 4 行');

  // 取某行 rowid，UPDATE 单元格
  const rid = db.exec(`SELECT rowid FROM users WHERE name='B'`)[0].values[0][0];
  db.run(`UPDATE "users" SET "age" = 99 WHERE rowid = ${rid}`);
  const newAge = db.exec(`SELECT age FROM users WHERE rowid = ${rid}`)[0].values[0][0];
  assert.strictEqual(newAge, 99, 'UPDATE 应生效');

  // 设为 NULL（NOT NULL 列 age 允许 NULL? age 无 NOT NULL）
  db.run(`UPDATE "users" SET "age" = NULL WHERE rowid = ${rid}`);
  const nullAge = db.exec(`SELECT age FROM users WHERE rowid = ${rid}`)[0].values[0][0];
  assert.strictEqual(nullAge, null, 'NULL 写入应生效');

  // DELETE
  const ridC = db.exec(`SELECT rowid FROM users WHERE name='C'`)[0].values[0][0];
  db.run(`DELETE FROM "users" WHERE rowid = ${ridC}`);
  count = db.exec(`SELECT COUNT(*) FROM users`)[0].values[0][0];
  assert.strictEqual(count, 3, '删除后应为 3 行');

  // 导出字节 → 宿主保存 → 重新加载，确认持久
  const bytes = db.export();
  db.close();
  const reopened = new SQL.Database(new Uint8Array(bytes));
  const finalCount = reopened.exec(`SELECT COUNT(*) FROM users`)[0].values[0][0];
  const names = reopened.exec(`SELECT name FROM users ORDER BY name`)[0].values.map((r) => r[0]);
  reopened.close();
  assert.strictEqual(finalCount, 3, '回写字节后行数应持久');
  assert.deepStrictEqual(names, ['A', 'B', 'D'], '回写字节后内容应持久');

  // 转义验证：含单引号的文本插入
  const db2 = new SQL.Database();
  db2.run(`CREATE TABLE t (v TEXT)`);
  const escaped = `'${String("O'Brien").replace(/'/g, "''")}'`;
  db2.run(`INSERT INTO "t" ("v") VALUES (${escaped})`);
  const v = db2.exec(`SELECT v FROM t`)[0].values[0][0];
  db2.close();
  assert.strictEqual(v, "O'Brien", '单引号转义应正确');

  console.log('✅ M2 增删改 + NULL + 转义 + 导出回写字节 全部验证通过');
})();
