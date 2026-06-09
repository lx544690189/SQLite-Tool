/**
 * Webview ↔ 扩展宿主 的 postMessage 桥接层。
 * 对外暴露与原 customApis 语义对齐的异步方法。
 */

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

interface BinaryPayload {
  encoding: 'base64';
  value: string;
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
interface PushMsg {
  kind: 'push';
  type: 'init' | 'reload';
  data: BinaryPayload;
}
type HostMsg = ResponseMsg | PushMsg;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
const pending = new Map<string, Pending>();

type PushHandler = (data: Uint8Array) => void;
const pushHandlers: Record<'init' | 'reload', PushHandler | null> = {
  init: null,
  reload: null,
};

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
    throw new Error('无效的数据库字节载荷');
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
      p.reject(new Error(msg.error ?? '宿主请求失败'));
    }
    return;
  }
  if (msg.kind === 'push') {
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
  /** 注册初始字节推送回调 */
  onInit(handler: PushHandler): void {
    pushHandlers.init = handler;
  },
  /** 注册 revert/undo 后的重新加载推送回调 */
  onReload(handler: PushHandler): void {
    pushHandlers.reload = handler;
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
  getFileInfo(): Promise<{ size: number; modified: number }> {
    return request('getFileInfo');
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
};

export const wasmUri = window.__SQL_WASM_URI__ ?? './sql-wasm.wasm';
