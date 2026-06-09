import * as vscode from 'vscode';

/**
 * SQLite 自定义文档：持有数据库字节，参与 VSCode 脏标记/保存/撤销生命周期。
 */
export class SqliteDocument implements vscode.CustomDocument {
  private _documentData: Uint8Array;
  private _savedData: Uint8Array;
  private _lastKnownDiskMtime: number;
  private _lastKnownDiskSize: number;
  public readonly openedAt: number;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  public readonly onDidDispose = this._onDidDispose.event;

  private constructor(
    public readonly uri: vscode.Uri,
    initialData: Uint8Array,
    initialStat: vscode.FileStat,
  ) {
    this._documentData = initialData;
    this._savedData = initialData;
    this._lastKnownDiskMtime = initialStat.mtime;
    this._lastKnownDiskSize = initialStat.size;
    this.openedAt = Date.now();
  }

  static async create(uri: vscode.Uri, backupId: string | undefined): Promise<SqliteDocument> {
    const dataFile = backupId ? vscode.Uri.parse(backupId) : uri;
    const data = await SqliteDocument.readFile(dataFile);
    const stat = await SqliteDocument.statFile(uri, data);
    return new SqliteDocument(uri, data, stat);
  }

  private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === 'untitled') {
      return new Uint8Array();
    }
    return vscode.workspace.fs.readFile(uri);
  }

  private static async statFile(uri: vscode.Uri, fallbackData: Uint8Array): Promise<vscode.FileStat> {
    if (uri.scheme === 'untitled') {
      return {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: fallbackData.byteLength,
      };
    }
    return vscode.workspace.fs.stat(uri);
  }

  private static bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) {
      return false;
    }
    for (let i = 0; i < a.byteLength; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  get documentData(): Uint8Array {
    return this._documentData;
  }

  /** 内容变更（来自 Webview）：更新当前字节 */
  setData(data: Uint8Array): void {
    this._documentData = data;
  }

  /** 当前磁盘状态是否已不同于文档最后确认的磁盘版本 */
  hasExternalChange(stat: vscode.FileStat): boolean {
    return stat.mtime !== this._lastKnownDiskMtime || stat.size !== this._lastKnownDiskSize;
  }

  /** 更新最后确认的磁盘版本 */
  setKnownDiskStat(stat: vscode.FileStat): void {
    this._lastKnownDiskMtime = stat.mtime;
    this._lastKnownDiskSize = stat.size;
  }

  hasUnsavedChanges(): boolean {
    return !SqliteDocument.bytesEqual(this._documentData, this._savedData);
  }

  /** 写回磁盘 */
  async save(
    targetResource: vscode.Uri,
    cancellation: vscode.CancellationToken,
    markSaved = true,
  ): Promise<void> {
    if (cancellation.isCancellationRequested) {
      return;
    }
    await vscode.workspace.fs.writeFile(targetResource, this._documentData);
    if (markSaved) {
      this._savedData = this._documentData;
    }
    if (targetResource.toString() === this.uri.toString()) {
      const stat = await SqliteDocument.statFile(targetResource, this._documentData);
      this.setKnownDiskStat(stat);
    }
  }

  /** 从磁盘重新读取 */
  async revert(): Promise<Uint8Array> {
    const data = await SqliteDocument.readFile(this.uri);
    const stat = await SqliteDocument.statFile(this.uri, data);
    this._documentData = data;
    this._savedData = data;
    this.setKnownDiskStat(stat);
    return data;
  }

  dispose(): void {
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
}
