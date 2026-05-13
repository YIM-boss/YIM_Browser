import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

// Default download path: C:\Users\Sabio\Downloads
const DEFAULT_DOWNLOAD_PATH = path.join('C:', 'Users', 'Sabio', 'Downloads');
const STORAGE_KEY = 'yimBrowser.downloadFolder';

export function activate(context: vscode.ExtensionContext) {

  // ─── Command: Set Download Folder ───────────────────────────────────────────
  const setFolderCmd = vscode.commands.registerCommand('yimBrowser.setDownloadFolder', async () => {
    const current = context.globalState.get<string>(STORAGE_KEY) ?? DEFAULT_DOWNLOAD_PATH;

    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(current),
      openLabel: 'Set as Download Folder'
    });

    if (selected && selected[0]) {
      const chosen = selected[0].fsPath;
      await context.globalState.update(STORAGE_KEY, chosen);
      vscode.window.showInformationMessage(`YIM Browser: Download folder set to "${chosen}"`);
    }
  });

  // ─── Command: Open Browser with Download Interception ───────────────────────
  const openBrowserCmd = vscode.commands.registerCommand('yimBrowser.openBrowser', async () => {
    const panel = vscode.window.createWebviewPanel(
      'yimBrowser',
      'YIM Browser',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const downloadFolder = context.globalState.get<string>(STORAGE_KEY) ?? DEFAULT_DOWNLOAD_PATH;

    panel.webview.html = getBrowserHTML(downloadFolder);

    // ─── Handle messages from the webview (download requests) ───────────────
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'download') {
        const { url, filename } = message;
        const folder = context.globalState.get<string>(STORAGE_KEY) ?? DEFAULT_DOWNLOAD_PATH;
        const dest = path.join(folder, filename || 'download');

        try {
          await downloadFile(url, dest);
          vscode.window.showInformationMessage(`Downloaded: ${path.basename(dest)} → ${folder}`);
        } catch (err) {
          vscode.window.showErrorMessage(`YIM Browser download failed: ${err}`);
        }
      }

      if (message.command === 'changeFolder') {
        await vscode.commands.executeCommand('yimBrowser.setDownloadFolder');
        const updated = context.globalState.get<string>(STORAGE_KEY) ?? DEFAULT_DOWNLOAD_PATH;
        panel.webview.postMessage({ command: 'folderUpdated', folder: updated });
      }
    });
  });

  // ─── Command: Download URL directly to configured folder ─────────────────
  // Intended for agent use: call via vscode.commands.executeCommand('yimBrowser.downloadUrl', url, filename)
  const downloadUrlCmd = vscode.commands.registerCommand('yimBrowser.downloadUrl', async (url: string, filename: string) => {
    if (!url || !filename) {
      vscode.window.showErrorMessage('YIM Browser: downloadUrl requires both a URL and a filename.');
      return;
    }
    const folder = context.globalState.get<string>(STORAGE_KEY) ?? DEFAULT_DOWNLOAD_PATH;
    const dest = path.join(folder, filename);
    try {
      await downloadFile(url, dest);
      vscode.window.showInformationMessage(`Downloaded: ${filename} -> ${folder}`);
    } catch (err) {
      vscode.window.showErrorMessage(`YIM Browser download failed: ${err}`);
    }
  });

  context.subscriptions.push(setFolderCmd, openBrowserCmd, downloadUrlCmd);

  vscode.window.showInformationMessage('YIM Browser extension activated. Use "YIM Browser: Open Browser" to start.');
}

// ─── Helper: Download file to disk ────────────────────────────────────────────
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err.message);
    });
  });
}

// ─── Webview HTML: Embedded browser UI with download interception ─────────────
function getBrowserHTML(currentFolder: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YIM Browser</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family, sans-serif); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; }
    #toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--vscode-titleBar-activeBackground); border-bottom: 1px solid var(--vscode-panel-border); }
    #urlBar { flex: 1; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 13px; }
    button { padding: 6px 12px; border-radius: 4px; border: none; background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; font-size: 12px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    #folderBar { padding: 4px 12px; font-size: 11px; color: var(--vscode-descriptionForeground); background: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-panel-border); display: flex; align-items: center; gap: 8px; }
    #folderBar span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #frame { flex: 1; border: none; width: 100%; }
  </style>
</head>
<body>
  <div id="toolbar">
    <input id="urlBar" type="text" placeholder="Enter URL and press Enter..." />
    <button onclick="navigate()">Go</button>
  </div>
  <div id="folderBar">
    <span>📁 Download folder: <strong id="folderDisplay">${currentFolder}</strong></span>
    <button onclick="changeFolder()">Change</button>
  </div>
  <iframe id="frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>

  <script>
    const vscode = acquireVsCodeApi();

    function navigate() {
      const url = document.getElementById('urlBar').value.trim();
      if (!url) return;
      const full = url.startsWith('http') ? url : 'https://' + url;
      document.getElementById('frame').src = full;
    }

    document.getElementById('urlBar').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate();
    });

    function changeFolder() {
      vscode.postMessage({ command: 'changeFolder' });
    }

    // Intercept download link clicks inside the iframe (same-origin only)
    document.getElementById('frame').addEventListener('load', () => {
      try {
        const iframeDoc = document.getElementById('frame').contentDocument;
        if (!iframeDoc) return;
        iframeDoc.addEventListener('click', (e) => {
          const link = e.target.closest('a[download], a[href$=".pdf"], a[href$=".zip"], a[href$=".exe"], a[href$=".docx"], a[href$=".xlsx"], a[href$=".csv"]');
          if (link) {
            e.preventDefault();
            const url = link.href;
            const filename = link.download || url.split('/').pop() || 'download';
            vscode.postMessage({ command: 'download', url, filename });
          }
        });
      } catch (_) {
        // Cross-origin iframe — interception not possible, falls back to browser default
      }
    });

    // Receive updated folder path from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'folderUpdated') {
        document.getElementById('folderDisplay').textContent = msg.folder;
      }
    });
  </script>
</body>
</html>`;
}

export function deactivate() {}
