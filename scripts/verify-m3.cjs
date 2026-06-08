// 验证 M3：建表 SQL 生成、CREATE/ALTER 执行、SQL 执行器查询/写操作分类
const initSqlJs = require('sql.js');
const assert = require('node:assert');

// 复制 NewTableModal.buildCreateSQL 的核心逻辑做独立验证
function quoteIdent(name) {
  return `"${name.trim().replace(/"/g, '""')}"`;
}

function normalizeType(type) {
  return type.trim().toUpperCase();
}

function isNumericType(type) {
  return ['INTEGER', 'REAL', 'NUMERIC', 'DECIMAL'].includes(normalizeType(type));
}

function buildDefaultSQL(col) {
  if (col.defaultMode === 'none') return null;
  if (col.defaultMode === 'null') return 'DEFAULT NULL';
  const value = col.dflt.trim();
  if (!value) return null;
  if (col.defaultMode === 'expression') return `DEFAULT ${value}`;
  if (isNumericType(col.type) || normalizeType(col.type) === 'BOOLEAN') {
    return `DEFAULT ${value}`;
  }
  return `DEFAULT '${value.replace(/'/g, "''")}'`;
}

function buildCreateSQL(tableName, cols) {
  const valid = cols.filter((c) => c.name.trim());
  const lines = valid.map((c) => {
    const type = normalizeType(c.type);
    const parts = [`  ${quoteIdent(c.name)} ${type}`];
    if (c.pk) parts.push(`PRIMARY KEY${c.autoIncrement && type === 'INTEGER' ? ' AUTOINCREMENT' : ''}`);
    if (c.notnull) parts.push('NOT NULL');
    if (c.unique && !c.pk) parts.push('UNIQUE');
    const defaultSql = buildDefaultSQL(c);
    if (defaultSql) parts.push(defaultSql);
    if (c.checkExpr.trim()) {
      parts.push(`CHECK (${c.checkExpr.trim()})`);
    }
    if (c.refTable.trim() && c.refColumn.trim()) {
      parts.push(
        `REFERENCES ${quoteIdent(c.refTable)} (${quoteIdent(c.refColumn)}) ON DELETE ${c.onDelete} ON UPDATE ${c.onUpdate}`,
      );
    }
    return parts.join(' ');
  });
  return `CREATE TABLE ${quoteIdent(tableName)} (\n${lines.join(',\n')}\n);`;
}

function col(overrides) {
  return {
    pk: false,
    autoIncrement: false,
    notnull: false,
    unique: false,
    dflt: '',
    defaultMode: 'none',
    checkExpr: '',
    refTable: '',
    refColumn: '',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
    ...overrides,
  };
}

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // 1. 生成并执行建表 SQL
  const sql = buildCreateSQL('products', [
    col({
      name: 'id',
      type: 'INTEGER',
      pk: true,
      autoIncrement: true,
    }),
    col({
      name: 'title',
      type: 'TEXT',
      notnull: true,
    }),
    col({
      name: 'price',
      type: 'REAL',
      dflt: '0',
      defaultMode: 'literal',
      checkExpr: 'price >= 0',
    }),
    col({
      name: 'sku',
      type: 'TEXT',
      unique: true,
    }),
    col({
      name: 'category_id',
      type: 'INTEGER',
      refTable: 'categories',
      refColumn: 'id',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    }),
    col({
      name: 'created_at',
      type: 'DATETIME',
      dflt: 'CURRENT_TIMESTAMP',
      defaultMode: 'expression',
    }),
    col({
      name: 'meta',
      type: 'JSON',
      dflt: '{}',
      defaultMode: 'literal',
    }),
  ]);
  assert.match(sql, /"id" INTEGER PRIMARY KEY AUTOINCREMENT/, '应支持 INTEGER 主键自增');
  assert.match(sql, /"price" REAL DEFAULT 0 CHECK \(price >= 0\)/, '应支持 CHECK 约束');
  assert.match(
    sql,
    /"category_id" INTEGER REFERENCES "categories" \("id"\) ON DELETE CASCADE ON UPDATE CASCADE/,
    '应支持外键引用与更新/删除动作',
  );
  assert.match(sql, /"created_at" DATETIME DEFAULT CURRENT_TIMESTAMP/, '应支持默认值表达式');
  assert.match(sql, /"meta" JSON DEFAULT '\{\}'/, '常用类型字面量默认值应正确加引号');
  db.run(sql);
  const tables = db
    .exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)[0]
    .values.map((r) => r[0]);
  assert.deepStrictEqual(tables, ['categories', 'products'], '建表应成功');

  // 验证 DEFAULT 生效
  db.run(`INSERT INTO "categories" ("name") VALUES ('tools')`);
  db.run(`INSERT INTO "products" ("title", "category_id") VALUES ('A', 1)`);
  const inserted = db.exec(`SELECT id, price, category_id, created_at, meta FROM products WHERE title='A'`)[0].values[0];
  const [id, price, categoryId, createdAt, meta] = inserted;
  assert.strictEqual(id, 1, 'AUTOINCREMENT 主键应自动生成');
  assert.strictEqual(price, 0, 'DEFAULT 0 应生效');
  assert.strictEqual(categoryId, 1, '外键字段应可写入已有父表记录');
  assert.ok(typeof createdAt === 'string' && createdAt.length > 0, 'CURRENT_TIMESTAMP 应生效');
  assert.strictEqual(meta, '{}', 'JSON 字面量默认值应生效');

  let checkErr = false;
  try {
    db.run(`INSERT INTO "products" ("title", "price") VALUES ('bad price', -1)`);
  } catch {
    checkErr = true;
  }
  assert.strictEqual(checkErr, true, 'CHECK 约束应阻止非法值');

  let fkErr = false;
  try {
    db.run(`INSERT INTO "products" ("title", "category_id") VALUES ('bad fk', 999)`);
  } catch {
    fkErr = true;
  }
  assert.strictEqual(fkErr, true, '外键约束应阻止不存在的父表记录');

  db.run(`DELETE FROM "categories" WHERE id = 1`);
  const cascadedCount = db.exec(`SELECT COUNT(*) FROM products WHERE title='A'`)[0].values[0][0];
  assert.strictEqual(cascadedCount, 0, 'ON DELETE CASCADE 应删除子表记录');
  db.run(`INSERT INTO "categories" ("name") VALUES ('tools2')`);

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
  assert.deepStrictEqual(renamed, ['categories', 'items'], '重命名应成功');

  // 3. SQL 执行器分类：SELECT 返回结果集，UPDATE 返回受影响行数
  const selectRes = db.exec(`SELECT * FROM items`);
  assert.ok(selectRes.length > 0 && selectRes[0].columns.length === 7, 'SELECT 应返回结果集');

  db.run(`UPDATE items SET price = 9.9 WHERE title='B'`);
  const modified = db.getRowsModified();
  assert.strictEqual(modified, 1, 'UPDATE 应影响 1 行');

  const isWrite = (s) => /\b(create|drop|alter|insert|update|delete|replace)\b/i.test(s);
  assert.strictEqual(isWrite('SELECT * FROM items'), false, 'SELECT 不应判为写操作');
  assert.strictEqual(isWrite('UPDATE items SET price=1'), true, 'UPDATE 应判为写操作');
  assert.strictEqual(isWrite('CREATE TABLE x(a)'), true, 'CREATE 应判为写操作');

  // 4. 标识符转义
  db.run(
    buildCreateSQL('quote"table', [
      col({
        name: 'quote"col',
        type: 'TEXT',
        dflt: "it's ok",
        defaultMode: 'literal',
      }),
    ]),
  );
  db.run(`INSERT INTO "quote""table" DEFAULT VALUES`);
  const quoted = db.exec(`SELECT "quote""col" FROM "quote""table"`)[0].values[0][0];
  assert.strictEqual(quoted, "it's ok", '表名/字段名/默认文本应正确转义');

  db.close();
  console.log('✅ M3 建表/DEFAULT/UNIQUE/重命名/SQL执行器分类 全部验证通过');
})();
