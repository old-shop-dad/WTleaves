const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// L3: 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'StudyDesk',
    backgroundColor: '#F4F7F8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // L3: 禁止应用内跳转到外部 URL
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // 加载构建后的 index.html（hash 路由，file:// 协议下刷新正常）
  const indexPath = path.join(__dirname, '..', 'dist', 'output', 'index.html');
  mainWindow.loadFile(indexPath);

  // 外部链接用系统浏览器打开，不在应用内跳转
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();

  // 阶段四：笔记导出 PDF（Electron 端 printToPDF + 保存对话框）
  ipcMain.handle('note:print-pdf', async (event, title) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false, reason: 'no-window' };
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出笔记为 PDF',
        defaultPath: `${(title || '笔记').replace(/[\\/:*?"<>|]/g, '_')}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
      const pdf = await event.sender.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
      await fs.promises.writeFile(filePath, pdf);
      return { ok: true, filePath };
    } catch (e) {
      return { ok: false, reason: (e && e.message) || 'print-failed' };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
