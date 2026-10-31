const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的安全 API
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // 阶段四：笔记导出 PDF（Electron 端 printToPDF + 保存对话框）
  printNoteToPdf: (title) => ipcRenderer.invoke('note:print-pdf', title),
});
