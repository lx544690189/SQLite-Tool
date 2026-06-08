import * as vscode from 'vscode';

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getDevServer(): URL | null {
  const raw = process.env.SQLITE_MANAGER_WEBVIEW_DEV_SERVER?.trim();
  if (!raw) {
    return null;
  }
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('SQLITE_MANAGER_WEBVIEW_DEV_SERVER 仅支持 http/https 地址');
  }
  return url;
}

function buildDevWebviewHtml(webview: vscode.Webview, devServer: URL): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;
  const devOrigin = devServer.origin;
  const wsProtocol = devServer.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsOrigin = `${wsProtocol}//${devServer.host}`;
  const wasmUri = `${devOrigin}/sql-wasm.wasm`;

  const csp = [
    `default-src 'none'`,
    `img-src ${cspSource} ${devOrigin} data:`,
    `style-src ${cspSource} ${devOrigin} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval' ${devOrigin} blob:`,
    `font-src ${cspSource} ${devOrigin}`,
    `connect-src ${cspSource} ${devOrigin} ${wsOrigin}`,
    `worker-src ${cspSource} ${devOrigin} blob:`,
  ].join('; ');

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <script nonce="${nonce}">window.__SQL_WASM_URI__ = "${wasmUri}";</script>
    <script nonce="${nonce}" type="module">
      import RefreshRuntime from "${devOrigin}/@react-refresh";
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>
    <script nonce="${nonce}" type="module" src="${devOrigin}/@vite/client"></script>
    <script nonce="${nonce}" type="module" src="${devOrigin}/src/main.tsx"></script>
    <title>SQLite 管理器</title>
  </head>
  <body>
    <div id="root" style="color: var(--vscode-foreground, #d4d4d4); font-family: var(--vscode-font-family, sans-serif);">
      正在连接 Webview 开发服务器...
    </div>
  </body>
</html>`;
}

/**
 * 读取 Vite 构建产物 media/index.html，改写资源 URI、注入 CSP/nonce 与 wasm 路径。
 */
export async function buildWebviewHtml(
  webview: vscode.Webview,
  mediaRoot: vscode.Uri,
): Promise<string> {
  const devServer = getDevServer();
  if (devServer) {
    return buildDevWebviewHtml(webview, devServer);
  }

  const indexUri = vscode.Uri.joinPath(mediaRoot, 'index.html');
  const bytes = await vscode.workspace.fs.readFile(indexUri);
  let html = Buffer.from(bytes).toString('utf8');

  const nonce = getNonce();
  const cspSource = webview.cspSource;

  // 将以 ./ 或 / 开头的本地资源引用改写为 asWebviewUri
  html = html.replace(
    /(href|src)="(\.?\/[^"]+)"/g,
    (_match, attr: string, rawPath: string) => {
      const clean = rawPath.replace(/^\.?\//, '');
      const resourceUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, clean));
      return `${attr}="${resourceUri}"`;
    },
  );

  // 给所有 script 标签注入 nonce
  html = html.replace(/<script /g, `<script nonce="${nonce}" `);

  // sql.js wasm 资源 URI（供 SQLiteHelper 的 locateFile 使用）
  const wasmUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'sql-wasm.wasm'));

  const csp = [
    `default-src 'none'`,
    `img-src ${cspSource} data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval' blob:`,
    `font-src ${cspSource}`,
    `connect-src ${cspSource}`,
    `worker-src ${cspSource} blob:`,
  ].join('; ');

  const injectHead = [
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<script nonce="${nonce}">window.__SQL_WASM_URI__ = "${wasmUri}";</script>`,
  ].join('\n    ');

  html = html.replace('</head>', `    ${injectHead}\n  </head>`);

  return html;
}
