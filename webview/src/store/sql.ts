import { proxy } from 'valtio';
import { bridge } from '../bridge';

export interface HistoryItem {
  sql: string;
  at: number;
}

interface SqlState {
  history: HistoryItem[];
}

const MAX_HISTORY = 50;
const HISTORY_STORAGE_PREFIX = 'sqlite-tool-sql-history:';

export const sqlState = proxy<SqlState>({ history: [] });

interface PersistedSettings {
  sqlHistory?: HistoryItem[];
  [key: string]: unknown;
}

let historyStorageKey: string | null = null;

function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is HistoryItem => {
      return (
        !!item &&
        typeof item === 'object' &&
        typeof (item as HistoryItem).sql === 'string' &&
        typeof (item as HistoryItem).at === 'number'
      );
    })
    .slice(0, MAX_HISTORY);
}

function getHistoryStorageKey(documentUri: string): string {
  return `${HISTORY_STORAGE_PREFIX}${documentUri}`;
}

function readLocalHistory(key: string): HistoryItem[] | null {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return null;
  }
  try {
    return normalizeHistory(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveLocalHistory(history: HistoryItem[]): void {
  if (!historyStorageKey) {
    return;
  }
  localStorage.setItem(historyStorageKey, JSON.stringify(normalizeHistory(history)));
}

/** 载入当前数据库文件关联的 SQL 执行历史 */
export async function loadHistory(): Promise<void> {
  try {
    const documentUri = await bridge.getDocumentUri();
    historyStorageKey = getHistoryStorageKey(documentUri);

    const localHistory = readLocalHistory(historyStorageKey);
    if (localHistory !== null) {
      sqlState.history = localHistory;
      return;
    }

    const legacySettings = await bridge.getSettings<PersistedSettings>();
    const legacyHistory = normalizeHistory(legacySettings?.sqlHistory);
    if (legacyHistory.length > 0) {
      sqlState.history = legacyHistory;
      saveLocalHistory(legacyHistory);
      const { sqlHistory: _sqlHistory, ...settingsWithoutHistory } = legacySettings ?? {};
      await bridge.saveSettings(settingsWithoutHistory);
    } else {
      sqlState.history = [];
    }
  } catch {
    // 忽略：无历史不影响使用
  }
}

async function persist(): Promise<void> {
  try {
    saveLocalHistory(sqlState.history);
  } catch {
    // 忽略持久化失败
  }
}

export function addHistory(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) return;
  const next = sqlState.history.filter((h) => h.sql !== trimmed);
  next.unshift({ sql: trimmed, at: Date.now() });
  sqlState.history = next.slice(0, MAX_HISTORY);
  void persist();
}

export function clearHistory(): void {
  sqlState.history = [];
  void persist();
}
