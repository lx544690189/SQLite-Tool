import { proxy } from 'valtio';
import SQLiteHelper, { type TableInfo } from '../utils/SQLiteHelper';
import { bridge } from '../bridge';

export const helper = new SQLiteHelper();

interface DbState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  tables: TableInfo[];
  activeTable: string | null;
  /** 字节版本号：每次 init/reload/变更后自增，供数据面板感知刷新 */
  version: number;
}

export const dbState = proxy<DbState>({
  initialized: false,
  loading: true,
  error: null,
  tables: [],
  activeTable: null,
  version: 0,
});

/** 刷新表列表（含行数） */
export function refreshTables(): void {
  try {
    dbState.tables = helper.getTableInfoList();
    if (dbState.activeTable && !dbState.tables.some((t) => t.name === dbState.activeTable)) {
      dbState.activeTable = null;
    }
    if (!dbState.activeTable && dbState.tables.length > 0) {
      dbState.activeTable = dbState.tables[0].name;
    }
  } catch (err) {
    dbState.error = err instanceof Error ? err.message : String(err);
  }
}

export function setActiveTable(name: string): void {
  dbState.activeTable = name;
}

/** 变更后：自增版本、刷新表行数（数据面板据 version 重查） */
function afterMutation(): void {
  dbState.version += 1;
  refreshTables();
}

export function addRow(tableName: string, data: Record<string, any>, schema: any[]): void {
  helper.insertRow(tableName, data, schema);
  afterMutation();
}

export function editCell(
  tableName: string,
  row: Record<string, any>,
  column: string,
  value: any,
  schema: any[],
): void {
  helper.updateCell(tableName, row, column, value, schema);
  afterMutation();
}

export function removeRow(tableName: string, row: Record<string, any>, schema: any[]): void {
  helper.deleteRow(tableName, row, schema);
  afterMutation();
}

export function renameTable(oldName: string, newName: string): void {
  helper.renameTable(oldName, newName);
  if (dbState.activeTable === oldName) {
    dbState.activeTable = newName;
  }
  afterMutation();
}

/** 启动：注册推送回调并请求初始字节 */
export async function bootstrap(): Promise<void> {
  bridge.onInit(async (bytes) => {
    try {
      await helper.init(bytes);
      dbState.initialized = true;
      dbState.error = null;
      dbState.version += 1;
      refreshTables();
    } catch (err) {
      dbState.error = err instanceof Error ? err.message : String(err);
    } finally {
      dbState.loading = false;
    }
  });

  bridge.onReload((bytes) => {
    try {
      helper.reload(bytes);
      dbState.error = null;
      dbState.version += 1;
      refreshTables();
    } catch (err) {
      dbState.error = err instanceof Error ? err.message : String(err);
    }
  });

  await bridge.ready();
}
