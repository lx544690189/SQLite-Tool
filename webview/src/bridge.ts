/**
 * Webview ↔ 扩展宿主 的 postMessage 桥接层。
 * 对外暴露与原 customApis 语义对齐的异步方法。
 */

import { t, type SupportedLanguage } from './i18n';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

interface BinaryPayload {
  encoding: 'base64';
  value: string;
}

export interface FileStatus {
  size: number;
  modified: number;
  openedAt: number;
  externallyModified: boolean;
}

declare global {
  interface Window {
    acquireVsCodeApi: () => VsCodeApi;
    __SQL_WASM_URI__?: string;
  }
}

const vscode = window.acquireVsCodeApi();

interface ResponseMsg {
  kind: 'res';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
interface DatabasePushMsg {
  kind: 'push';
  type: 'init' | 'reload';
  data: BinaryPayload;
}
interface FileStatusPushMsg {
  kind: 'push';
  type: 'fileStatus';
  data: FileStatus;
}
interface SettingsPushMsg {
  kind: 'push';
  type: 'settings';
  data: Record<string, unknown>;
}
type HostMsg = ResponseMsg | DatabasePushMsg | FileStatusPushMsg | SettingsPushMsg;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
const pending = new Map<string, Pending>();

type PushHandler = (data: Uint8Array) => void;
type FileStatusHandler = (data: FileStatus) => void;
type SettingsHandler = (data: Record<string, unknown>) => void;
const pushHandlers: Record<'init' | 'reload', PushHandler | null> = {
  init: null,
  reload: null,
};
let fileStatusHandler: FileStatusHandler | null = null;
let settingsHandler: SettingsHandler | null = null;
let bridgeLanguage: SupportedLanguage = 'en';

let seq = 0;
function nextId(): string {
  seq += 1;
  return `r${seq}`;
}

function encodeBytes(data: Uint8Array): BinaryPayload {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return { encoding: 'base64', value: btoa(binary) };
}

function decodeBytes(payload: BinaryPayload): Uint8Array {
  if (!payload || payload.encoding !== 'base64' || typeof payload.value !== 'string') {
    throw new Error(t(bridgeLanguage, 'bridge.invalidPayload'));
  }
  const binary = atob(payload.value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

window.addEventListener('message', (event: MessageEvent<HostMsg>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') {
    return;
  }
  if (msg.kind === 'res') {
    const p = pending.get(msg.id);
    if (!p) {
      return;
    }
    pending.delete(msg.id);
    if (msg.ok) {
      p.resolve(msg.result);
    } else {
      p.reject(new Error(msg.error ?? t(bridgeLanguage, 'bridge.hostRequestFailed')));
    }
    return;
  }
  if (msg.kind === 'push') {
    if (msg.type === 'fileStatus') {
      fileStatusHandler?.(msg.data);
      return;
    }
    if (msg.type === 'settings') {
      settingsHandler?.(msg.data);
      return;
    }
    const handler = pushHandlers[msg.type];
    handler?.(decodeBytes(msg.data));
  }
});

function request<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
  const id = nextId();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    vscode.postMessage({ kind: 'req', id, method, params });
  });
}

export const bridge = {
  /** 设置桥接层错误文案语言 */
  setLanguage(language: SupportedLanguage): void {
    bridgeLanguage = language;
  },
  /** 注册初始字节推送回调 */
  onInit(handler: PushHandler): void {
    pushHandlers.init = handler;
  },
  /** 注册 revert/undo 后的重新加载推送回调 */
  onReload(handler: PushHandler): void {
    pushHandlers.reload = handler;
  },
  /** 注册文件状态推送回调 */
  onFileStatus(handler: FileStatusHandler): void {
    fileStatusHandler = handler;
  },
  /** 注册设置推送回调 */
  onSettings(handler: SettingsHandler): void {
    settingsHandler = handler;
  },
  /** 通知宿主 Webview 已就绪，请求推送初始字节 */
  ready(): Promise<void> {
    return request<void>('ready');
  },
  /** 通知宿主内容已变更（触发脏标记） */
  notifyChanged(data: Uint8Array, label?: string): void {
    vscode.postMessage({ kind: 'changed', data: encodeBytes(data), label });
  },
  /** 文件信息（大小、修改时间） */
  getFileInfo(): Promise<FileStatus> {
    return request('getFileInfo');
  },
  /** 重新从磁盘加载当前数据库 */
  reloadFromDisk(): Promise<FileStatus> {
    return request<FileStatus>('reloadFromDisk');
  },
  /** 当前数据库文档 URI */
  getDocumentUri(): Promise<string> {
    return request<string>('getDocumentUri');
  },
  /** 在资源管理器中定位文件 */
  openFileLocation(): Promise<void> {
    return request<void>('openFileLocation');
  },
  /** 读取设置 */
  getSettings<T = Record<string, unknown>>(): Promise<T> {
    return request<T>('getSettings');
  },
  /** 保存设置 */
  saveSettings(settings: unknown): Promise<void> {
    return request<void>('saveSettings', settings);
  },
  /** 读取 VS Code 剪贴板文本 */
  readClipboard(): Promise<string> {
    return request<string>('readClipboard');
  },
  /** 写入 VS Code 剪贴板文本 */
  writeClipboard(text: string): Promise<void> {
    return request<void>('writeClipboard', text);
  },
};

export const wasmUri = window.__SQL_WASM_URI__ ?? './sql-wasm.wasm';
