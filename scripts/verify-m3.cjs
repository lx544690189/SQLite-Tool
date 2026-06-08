// 验证 M3：建表 SQL 生成、CREATE/ALTER 执行、SQL 执行器查询/写操作分类
const initSqlJs = require('sql.js');
const assert = require('node:assert');

// 复制 NewTableModal.buildCreateSQL 的核心逻辑做独立验证
function buildCreateSQL(tableName, cols) {
  const lines = cols.map((c) => {
    const parts = [`  "${c.name}" ${c.type}`];
    if (c.pk) parts.push('PRIMARY KEY');
    if (c.notnull) parts.push('NOT NULL');
    if (c.unique && !c.pk) parts.push('UNIQUE');
    if (c.dflt) {
      const isNum = ['INTEGER', 'REAL', 'NUMERIC'].includes(c.type);
      parts.push(`DEFAULT ${isNum ? c.dflt : `'${c.dflt}'`}`);
    }
    return parts.join(' ');
  });
  return `CREATE TABLE "${tableName}" (\n${lines.join(',\n')}\n);`;
}

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // 1. 生成并执行建表 SQL
  const sql = buildCreateSQL('products', [
    { name: 'id', type: 'INTEGER', pk: true, notnull: false, unique: false, dflt: '' },
    { name: 'title', type: 'TEXT', pk: false, notnull: true, unique: false, dflt: '' },
    { name: 'price', type: 'REAL', pk: false, notnull: false, unique: false, dflt: '0' },
    { name: 'sku', type: 'TEXT', pk: false, notnull: false, unique: true, dflt: '' },
  ]);
  db.run(sql);
  const tables = db
    .exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)[0]
    .values.map((r) => r[0]);
  assert.deepStrictEqual(tables, ['products'], '建表应成功');

  // 验证 DEFAULT 生效
  db.run(`INSERT INTO "products" ("title") VALUES ('A')`);
  const price = db.exec(`SELECT price FROM products WHERE title='A'`)[0].values[0][0];
  assert.strictEqual(price, 0, 'DEFAULT 0 应生效');

  // 验证 UNIQUE 约束
  db.run(`INSERT INTO "products" ("title","sku") VALUES ('B','x')`);
  let uniqueErr = false;
  try {
    db.run(`INSERT INTO "products" ("title","sku") VALUES ('C','x')`);
  } catch {
    uniqueErr = true;
  }
  assert.strictEqual(uniqueErr, true, 'UNIQUE 约束应阻止重复');

  // 2. 重命名表
  db.run(`ALTER TABLE "products" RENAME TO "items"`);
  const renamed = db
    .exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)[0]
    .values.map((r) => r[0]);
  assert.deepStrictEqual(renamed, ['items'], '重命名应成功');

  // 3. SQL 执行器分类：SELECT 返回结果集，UPDATE 返回受影响行数
  const selectRes = db.exec(`SELECT * FROM items`);
  assert.ok(selectRes.length > 0 && selectRes[0].columns.length === 4, 'SELECT 应返回结果集');

  db.run(`UPDATE items SET price = 9.9 WHERE title='A'`);
  const modified = db.getRowsModified();
  assert.strictEqual(modified, 1, 'UPDATE 应影响 1 行');

  const isWrite = (s) => /\b(create|drop|alter|insert|update|delete|replace)\b/i.test(s);
  assert.strictEqual(isWrite('SELECT * FROM items'), false, 'SELECT 不应判为写操作');
  assert.strictEqual(isWrite('UPDATE items SET price=1'), true, 'UPDATE 应判为写操作');
  assert.strictEqual(isWrite('CREATE TABLE x(a)'), true, 'CREATE 应判为写操作');

  db.close();
  console.log('✅ M3 建表/DEFAULT/UNIQUE/重命名/SQL执行器分类 全部验证通过');
})();
