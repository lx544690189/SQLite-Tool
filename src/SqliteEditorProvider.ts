import * as vscode from 'vscode';
import { SqliteDocument } from './SqliteDocument';
import { buildWebviewHtml } from './webviewHtml';

/** Webview → Host 请求 */
interface RequestMsg {
  kind: 'req';
  id: string;
  method: string;
  params: unknown[];
}
interface BinaryPayload {
  encoding: 'base64';
  value: string;
}
interface FileStatus {
  size: number;
  modified: number;
  openedAt: number;
  externallyModified: boolean;
}
/** Webview → Host 内容变更通知（标脏） */
interface ChangedMsg {
  kind: 'changed';
  data: BinaryPayload;
  label?: string;
}
type IncomingMsg = RequestMsg | ChangedMsg;

function encodeBytes(data: Uint8Array): BinaryPayload {
  return { encoding: 'base64', value: Buffer.from(data).toString('base64') };
}

function decodeBytes(payload: BinaryPayload): Uint8Array {
  if (!payload || payload.encoding !== 'base64' || typeof payload.value !== 'string') {
    throw new Error('无效的数据库字节载荷');
  }
  return new Uint8Array(Buffer.from(payload.value, 'base64'));
}

function getDevServerPort(): number | null {
  const raw = process.env.SQLITE_MANAGER_WEBVIEW_DEV_SERVER?.trim();
  if (!raw) {
    return null;
  }
  return Number(new URL(raw).port);
}

/**
 * SQLite 自定义编辑器 Provider。
 * 负责读取文件字节、渲染 Webview、postMessage 桥接、脏标记/保存/撤销/备份。
 */
export class SqliteEditorProvider implements vscode.CustomEditorProvider<SqliteDocument> {
  public static readonly viewType = 'sqliteManager.editor';

  private readonly _onDidChangeCustomDocument =
    new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SqliteDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  /** 单文档单编辑器：记录文档对应的 Webview，用于 revert 后推送 */
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new SqliteEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      SqliteEditorProvider.viewType,
      provider,
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: true },
      },
    );
  }

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
  ): Promise<SqliteDocument> {
    return SqliteDocument.create(uri, openContext.backupId);
  }

  async resolveCustomEditor(
    document: SqliteDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const key = document.uri.toString();
    this.panels.set(key, webviewPanel);

    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const devServerPort = getDevServerPort();
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot],
      portMapping: devServerPort
        ? [{ webviewPort: devServerPort, extensionHostPort: devServerPort }]
        : [],
    };
    webviewPanel.webview.html = await buildWebviewHtml(webviewPanel.webview, mediaRoot);

    const sub = webviewPanel.webview.onDidReceiveMessage((msg: IncomingMsg) =>
      this.onMessage(document, webviewPanel, msg),
    );
    webviewPanel.onDidDispose(() => {
      sub.dispose();
      if (this.panels.get(key) === webviewPanel) {
        this.panels.delete(key);
      }
    });
  }

  private async onMessage(
    document: SqliteDocument,
    panel: vscode.WebviewPanel,
    msg: IncomingMsg,
  ): Promise<void> {
    if (msg.kind === 'changed') {
      this.applyChange(document, decodeBytes(msg.data), msg.label);
      return;
    }
    if (msg.kind === 'req') {
      await this.handleRequest(document, panel, msg);
    }
  }

  private async handleRequest(
    document: SqliteDocument,
    panel: vscode.WebviewPanel,
    msg: RequestMsg,
  ): Promise<void> {
    const respond = (ok: boolean, result?: unknown, error?: string) =>
      panel.webview.postMessage({ kind: 'res', id: msg.id, ok, result, error });

    try {
      switch (msg.method) {
        case 'ready': {
          // Webview 就绪：推送初始字节
          await panel.webview.postMessage({
            kind: 'push',
            type: 'init',
            data: encodeBytes(document.documentData),
          });
          respond(true);
          break;
        }
        case 'getFileInfo': {
          respond(true, await this.getFileStatus(document));
          break;
        }
        case 'reloadFromDisk': {
          if (document.hasUnsavedChanges()) {
            await vscode.commands.executeCommand('workbench.action.files.revert');
          } else {
            const data = await document.revert();
            await panel.webview.postMessage({
              kind: 'push',
              type: 'reload',
              data: encodeBytes(data),
            });
          }
          respond(true, await this.getFileStatus(document));
          break;
        }
        case 'getDocumentUri': {
          respond(true, document.uri.toString());
          break;
        }
        case 'openFileLocation': {
          await vscode.commands.executeCommand('revealFileInOS', document.uri);
          respond(true);
          break;
        }
        case 'getSettings': {
          const value = this.context.globalState.get('sqliteManager.settings', {});
          respond(true, value);
          break;
        }
        case 'saveSettings': {
          await this.context.globalState.update('sqliteManager.settings', msg.params[0]);
          respond(true);
          break;
        }
        case 'readClipboard': {
          const text = await vscode.env.clipboard.readText();
          respond(true, text);
          break;
        }
        case 'writeClipboard': {
          const text = typeof msg.params[0] === 'string' ? msg.params[0] : '';
          await vscode.env.clipboard.writeText(text);
          respond(true);
          break;
        }
        default:
          respond(false, undefined, `未知方法: ${msg.method}`);
      }
    } catch (err) {
      respond(false, undefined, err instanceof Error ? err.message : String(err));
    }
  }

  /** 内容变更：更新字节并触发脏标记（携带 undo/redo 快照回退） */
  private applyChange(document: SqliteDocument, data: Uint8Array, label?: string): void {
    const before = document.documentData;
    document.setData(data);
    this._onDidChangeCustomDocument.fire({
      document,
      label: label ?? '编辑数据',
      undo: () => this.pushReload(document, before, document.setData.bind(document)),
      redo: () => this.pushReload(document, data, document.setData.bind(document)),
    });
  }

  /** 把指定字节写回文档并推送 Webview 重新加载 */
  private pushReload(
    document: SqliteDocument,
    data: Uint8Array,
    setData: (d: Uint8Array) => void,
  ): void {
    setData(data);
    const panel = this.panels.get(document.uri.toString());
    panel?.webview.postMessage({ kind: 'push', type: 'reload', data: encodeBytes(data) });
  }

  async saveCustomDocument(
    document: SqliteDocument,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await this.confirmSaveIfExternalChanged(document);
    await document.save(document.uri, cancellation);
    this.postFileStatus(document);
  }

  async saveCustomDocumentAs(
    document: SqliteDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await document.save(destination, cancellation);
    this.postFileStatus(document);
  }

  async revertCustomDocument(document: SqliteDocument): Promise<void> {
    const data = await document.revert();
    const panel = this.panels.get(document.uri.toString());
    panel?.webview.postMessage({ kind: 'push', type: 'reload', data: encodeBytes(data) });
    this.postFileStatus(document);
  }

  async backupCustomDocument(
    document: SqliteDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await document.save(context.destination, cancellation, false);
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // 备份文件可能已被清理，忽略
        }
      },
    };
  }

  private async statDocument(document: SqliteDocument): Promise<vscode.FileStat> {
    return vscode.workspace.fs.stat(document.uri);
  }

  private async getFileStatus(document: SqliteDocument): Promise<FileStatus> {
    const stat = await this.statDocument(document);
    const externallyModified =
      stat.mtime > document.openedAt && document.hasExternalChange(stat);
    return {
      size: stat.size,
      modified: stat.mtime,
      openedAt: document.openedAt,
      externallyModified,
    };
  }

  private async postFileStatus(document: SqliteDocument): Promise<void> {
    const panel = this.panels.get(document.uri.toString());
    if (!panel) {
      return;
    }
    try {
      const status = await this.getFileStatus(document);
      await panel.webview.postMessage({ kind: 'push', type: 'fileStatus', data: status });
    } catch {
      // 文件可能暂时不可访问，避免状态推送打断保存/还原流程。
    }
  }

  private async confirmSaveIfExternalChanged(document: SqliteDocument): Promise<void> {
    const stat = await this.statDocument(document);
    if (!document.hasExternalChange(stat) || stat.mtime <= document.openedAt) {
      return;
    }

    const overwrite = '继续保存';
    const reload = '取消，先重新加载';
    const choice = await vscode.window.showWarningMessage(
      '数据库文件已被外部更改，继续保存可能会覆盖外部修改。',
      { modal: true },
      overwrite,
      reload,
    );
    if (choice !== overwrite) {
      throw new vscode.CancellationError();
    }
  }
}
