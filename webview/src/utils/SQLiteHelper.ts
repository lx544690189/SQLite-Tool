import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { format } from 'sql-formatter';
import { bridge, wasmUri } from '../bridge';

export interface TableInfo {
  name: string;
  rowCount: number;
}

export interface PageResult<T = any> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ColumnCommentInfo {
  name: string;
  comment?: string;
}

export interface TableCommentInfo {
  tableName: string;
  tableComment?: string;
  columns: ColumnCommentInfo[];
}

/** 行定位策略：用于安全地编辑/删除某一行 */
export type RowKeyStrategy =
  | { type: 'rowid' }
  | { type: 'pk'; columns: string[] }
  | { type: 'none' };

export const ROWID_ALIAS = '__rowid__';

/**
 * SQLiteHelper：基于 sql.js 的内存数据库操作。
 * 改造点：不再读盘，由宿主 push 的字节注入；save() 经 bridge 回写触发脏标记。
 */
class SQLiteHelper {
  db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private initialized = false;
  private rowKeyCache = new Map<string, RowKeyStrategy>();

  /** 用宿主推送的字节初始化数据库 */
  async init(bytes: Uint8Array): Promise<boolean> {
    if (!this.SQL) {
      this.SQL = await initSqlJs({ locateFile: () => wasmUri });
    }
    this.db = new this.SQL.Database(bytes);
    this.db.run('PRAGMA foreign_keys = ON');
    this.initialized = true;
    this.rowKeyCache.clear();
    return true;
  }

  /** 用新字节重建实例（revert/undo/redo 后） */
  reload(bytes: Uint8Array): void {
    if (!this.SQL) {
      throw new Error('sql.js 尚未初始化');
    }
    if (this.db) {
      this.db.close();
    }
    this.db = new this.SQL.Database(bytes);
    this.db.run('PRAGMA foreign_keys = ON');
    this.initialized = true;
    this.rowKeyCache.clear();
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('数据库未初始化，请先调用 init() 方法');
    }
  }

  getTableCount(): number {
    return this.getTables().length;
  }

  getTables(): string[] {
    this.ensureInitialized();
    const result = this.db!.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    if (result.length === 0 || !result[0].values) {
      return [];
    }
    return result[0].values.map((row) => row[0] as string);
  }

  getTableInfoList(): TableInfo[] {
    const tables = this.getTables();
    return tables.map((name) => ({ name, rowCount: this.getTableRowCount(name) }));
  }

  getTableRowCount(tableName: string): number {
    this.ensureInitialized();
    if (!this.getTables().includes(tableName)) {
      throw new Error(`表 "${tableName}" 不存在`);
    }
    const result = this.db!.exec(`SELECT COUNT(*) as count FROM "${tableName}"`);
    if (result.length === 0 || !result[0].values || result[0].values.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }

  queryTableData<T = any>(
    tableName: string,
    page = 1,
    pageSize = 10,
    orderBy?: string,
    order: 'ASC' | 'DESC' = 'ASC',
    searchColumnName?: string,
    searchKeyword?: string,
  ): PageResult<T> {
    this.ensureInitialized();
    if (!this.getTables().includes(tableName)) {
      throw new Error(`表 "${tableName}" 不存在`);
    }

    const currentPage = Math.max(1, page);
    const currentPageSize = Math.max(1, pageSize);
    const offset = (currentPage - 1) * currentPageSize;

    let whereClause = '';
    let params: string[] = [];
    if (searchKeyword && searchKeyword.trim()) {
      const keyword = searchKeyword.trim();
      if (searchColumnName) {
        whereClause = `WHERE "${searchColumnName}" LIKE ?`;
        params.push(`%${keyword}%`);
      } else {
        const schema = this.getTableSchema(tableName);
        if (schema.length > 0) {
          const columnConditions = schema.map((col) => `"${col.name}" LIKE ?`).join(' OR ');
          whereClause = `WHERE ${columnConditions}`;
          params = Array(schema.length).fill(`%${keyword}%`);
        }
      }
    }

    const orderClause = orderBy ? `ORDER BY "${orderBy}" ${order}` : '';
    const strategy = this.getRowKeyStrategy(tableName);
    const selectCols = strategy.type === 'rowid' ? `rowid AS ${ROWID_ALIAS}, *` : '*';
    const countQuery = `SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`;
    const dataQuery = `SELECT ${selectCols} FROM "${tableName}" ${whereClause} ${orderClause} LIMIT ${currentPageSize} OFFSET ${offset}`;

    let finalCountQuery = countQuery;
    let finalDataQuery = dataQuery;
    params.forEach((param) => {
      const escaped = `'${param.replace(/'/g, "''")}'`;
      const ci = finalCountQuery.indexOf('?');
      if (ci !== -1) {
        finalCountQuery = finalCountQuery.slice(0, ci) + escaped + finalCountQuery.slice(ci + 1);
      }
      const di = finalDataQuery.indexOf('?');
      if (di !== -1) {
        finalDataQuery = finalDataQuery.slice(0, di) + escaped + finalDataQuery.slice(di + 1);
      }
    });

    const countResult = this.db!.exec(finalCountQuery);
    const total = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    const result = this.db!.exec(finalDataQuery);
    if (result.length === 0 || !result[0].values || !result[0].columns) {
      return { data: [], total, page: currentPage, pageSize: currentPageSize };
    }

    const columns = result[0].columns;
    const data = result[0].values.map((row) => {
      const item: any = {};
      columns.forEach((col, index) => {
        item[col] = row[index];
      });
      return item as T;
    });

    return { data, total, page: currentPage, pageSize: currentPageSize };
  }

  getTableSchema(tableName: string): any[] {
    this.ensureInitialized();
    if (!this.getTables().includes(tableName)) {
      throw new Error(`表 "${tableName}" 不存在`);
    }
    const result = this.db!.exec(`PRAGMA table_info("${tableName}")`);
    if (result.length === 0) {
      return [];
    }
    const columns = result[0].columns;
    return result[0].values.map((row) => {
      const item: any = {};
      columns.forEach((col, index) => {
        item[col] = row[index];
      });
      return item;
    });
  }

  getCreateTableSQL(tableName: string): string {
    this.ensureInitialized();
    if (!this.getTables().includes(tableName)) {
      throw new Error(`表 "${tableName}" 不存在`);
    }
    const result = this.db!.exec(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return '';
    }
    return result[0].values[0][0] as string;
  }

  getUniqueColumns(tableName: string): string[] {
    this.ensureInitialized();
    if (!this.getTables().includes(tableName)) {
      throw new Error(`表 "${tableName}" 不存在`);
    }
    const uniqueColumns: string[] = [];
    const indexListResult = this.db!.exec(`PRAGMA index_list("${tableName}")`);
    if (indexListResult.length === 0) {
      return uniqueColumns;
    }
    for (const indexRow of indexListResult[0].values) {
      const indexName = indexRow[1];
      const isUnique = indexRow[2];
      if (isUnique === 1) {
        const indexInfoResult = this.db!.exec(`PRAGMA index_info("${indexName}")`);
        if (indexInfoResult.length > 0) {
          for (const infoRow of indexInfoResult[0].values) {
            const columnName = infoRow[2];
            if (columnName) {
              uniqueColumns.push(String(columnName));
            }
          }
        }
      }
    }
    return uniqueColumns;
  }

  static formatSQL(sql: string): string {
    if (!sql || sql.trim() === '') {
      return '';
    }
    try {
      return format(sql, {
        language: 'sqlite',
        keywordCase: 'upper',
        indentStyle: 'standard',
        tabWidth: 2,
      });
    } catch {
      return sql;
    }
  }

  executeQuery<T = any>(sql: string): T[] {
    this.ensureInitialized();
    const result = this.db!.exec(sql);
    if (result.length === 0 || !result[0].values || !result[0].columns) {
      return [];
    }
    const columns = result[0].columns;
    return result[0].values.map((row) => {
      const item: any = {};
      columns.forEach((col, index) => {
        item[col] = row[index];
      });
      return item as T;
    });
  }

  executeUpdate(sql: string): boolean {
    this.ensureInitialized();
    this.db!.run(sql);
    return true;
  }

  /** 行定位策略：优先 rowid，其次主键列，否则不可定位 */
  getRowKeyStrategy(tableName: string): RowKeyStrategy {
    const cached = this.rowKeyCache.get(tableName);
    if (cached) {
      return cached;
    }
    this.ensureInitialized();
    let strategy: RowKeyStrategy;
    try {
      this.db!.exec(`SELECT rowid FROM "${tableName}" LIMIT 1`);
      strategy = { type: 'rowid' };
    } catch {
      const pkCols = this.getTableSchema(tableName)
        .filter((c) => c.pk > 0)
        .map((c) => c.name as string);
      strategy = pkCols.length > 0 ? { type: 'pk', columns: pkCols } : { type: 'none' };
    }
    this.rowKeyCache.set(tableName, strategy);
    return strategy;
  }

  /** 该表是否可定位（从而支持行内编辑/删除） */
  canLocateRows(tableName: string): boolean {
    return this.getRowKeyStrategy(tableName).type !== 'none';
  }

  private columnType(schema: any[], name: string): string {
    const col = schema.find((c) => c.name === name);
    return col ? (col.type || '') : '';
  }

  /** 构造定位某行的 WHERE 子句 */
  private buildWhere(tableName: string, row: Record<string, any>, schema: any[]): string {
    const strategy = this.getRowKeyStrategy(tableName);
    if (strategy.type === 'rowid') {
      const rid = row[ROWID_ALIAS];
      if (rid === undefined || rid === null) {
        throw new Error('缺少 rowid，无法定位该行');
      }
      return `WHERE rowid = ${Number(rid)}`;
    }
    if (strategy.type === 'pk') {
      const conds = strategy.columns.map((col) => {
        const v = row[col];
        if (v === null || v === undefined) {
          return `"${col}" IS NULL`;
        }
        return `"${col}" = ${this.formatValue(v, this.columnType(schema, col))}`;
      });
      return `WHERE ${conds.join(' AND ')}`;
    }
    throw new Error('该表无主键且不支持 rowid，无法编辑/删除行');
  }

  /** 新增行 */
  insertRow(tableName: string, data: Record<string, any>, schema: any[]): void {
    this.ensureInitialized();
    const sql = this.generateInsertSQL(tableName, data, schema);
    this.db!.run(sql);
    this.save('新增行');
  }

  /** 更新某行的单个字段 */
  updateCell(
    tableName: string,
    row: Record<string, any>,
    column: string,
    value: any,
    schema: any[],
  ): void {
    this.ensureInitialized();
    const where = this.buildWhere(tableName, row, schema);
    const formatted = this.formatValue(value, this.columnType(schema, column));
    this.db!.run(`UPDATE "${tableName}" SET "${column}" = ${formatted} ${where}`);
    this.save('编辑单元格');
  }

  /** 更新某行的多个字段 */
  updateRow(
    tableName: string,
    row: Record<string, any>,
    changes: Record<string, any>,
    schema: any[],
  ): void {
    this.ensureInitialized();
    const entries = Object.entries(changes);
    if (entries.length === 0) {
      return;
    }
    const where = this.buildWhere(tableName, row, schema);
    const assignments = entries
      .map(([column, value]) => `"${column}" = ${this.formatValue(value, this.columnType(schema, column))}`)
      .join(', ');
    this.db!.run(`UPDATE "${tableName}" SET ${assignments} ${where}`);
    if (this.db!.getRowsModified() === 0) {
      throw new Error('未找到要更新的行，可能数据已被刷新或删除');
    }
    this.save('编辑行');
  }

  /** 删除某行 */
  deleteRow(tableName: string, row: Record<string, any>, schema: any[]): void {
    this.ensureInitialized();
    const where = this.buildWhere(tableName, row, schema);
    this.db!.run(`DELETE FROM "${tableName}" ${where}`);
    this.save('删除行');
  }

  /** 重命名表 */
  renameTable(oldName: string, newName: string): void {
    this.ensureInitialized();
    this.db!.run(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
    this.rowKeyCache.delete(oldName);
    this.save('重命名表');
  }

  /** 执行建表语句 */
  createTable(sql: string): void {
    this.ensureInitialized();
    this.db!.run(sql);
    this.save('新建表');
  }

  /**
   * 执行任意 SQL 脚本：返回查询结果集与受影响行数。
   * 若包含写操作/DDL，则触发字节回写标脏。
   */
  executeSqlScript(sql: string): {
    results: { columns: string[]; values: any[][] }[];
    rowsModified: number;
    changed: boolean;
  } {
    this.ensureInitialized();
    const results = this.db!.exec(sql).map((r) => ({ columns: r.columns, values: r.values }));
    const rowsModified = this.db!.getRowsModified();
    const isWrite = /\b(create|drop|alter|insert|update|delete|replace|reindex|vacuum)\b/i.test(sql);
    const changed = isWrite || rowsModified > 0;
    if (changed) {
      this.save('执行 SQL');
    }
    return { results, rowsModified, changed };
  }

  export(): Uint8Array {
    this.ensureInitialized();
    return this.db!.export();
  }

  /** 导出当前字节并通知宿主标脏（替代原直接落盘） */
  save(label?: string): void {
    bridge.notifyChanged(this.export(), label);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  generateInsertSQL(tableName: string, data: Record<string, any>, schema: any[]): string {
    const columns = schema.filter((col) => {
      if (col.pk > 0 && (col.type || '').toUpperCase() === 'INTEGER') return false;
      return true;
    });
    if (columns.length === 0) {
      return `INSERT INTO "${tableName}" DEFAULT VALUES;`;
    }
    const columnNames = columns.map((col) => `"${col.name}"`).join(', ');
    const values = columns
      .map((col) => {
        const value = data[col.name];
        const type = (col.type || '').toUpperCase();
        if (value === null || value === '' || value === undefined) {
          return 'NULL';
        }
        if (['INTEGER', 'REAL', 'NUMERIC'].includes(type)) {
          return value;
        }
        return `'${String(value).replace(/'/g, "''")}'`;
      })
      .join(', ');
    return `INSERT INTO "${tableName}" (${columnNames}) VALUES (${values});`;
  }

  formatValue(value: any, type: string): string {
    const typeUpper = (type || '').toUpperCase();
    if (value === null || value === undefined || value === '') {
      return 'NULL';
    }
    if (['INTEGER', 'REAL', 'NUMERIC'].includes(typeUpper)) {
      return String(value);
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}

export default SQLiteHelper;
