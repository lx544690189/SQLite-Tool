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

export const sqlState = proxy<SqlState>({ history: [] });

interface PersistedSettings {
  sqlHistory?: HistoryItem[];
}

/** 从 globalState 载入历史 */
export async function loadHistory(): Promise<void> {
  try {
    const settings = await bridge.getSettings<PersistedSettings>();
    if (Array.isArray(settings?.sqlHistory)) {
      sqlState.history = settings.sqlHistory;
    }
  } catch {
    // 忽略：无历史不影响使用
  }
}

async function persist(): Promise<void> {
  try {
    const settings = await bridge.getSettings<PersistedSettings>();
    await bridge.saveSettings({ ...settings, sqlHistory: sqlState.history });
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
