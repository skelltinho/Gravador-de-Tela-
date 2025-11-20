const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron')
const path = require('path')
const Store = require('electron-store')

const store = new Store();

// Configuração do Store (Persistência)
ipcMain.handle('getStoreValue', (event, key) => store.get(key));
ipcMain.handle('setStoreValue', (event, key, value) => store.set(key, value));

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 500,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Habilitar recursos de mídia
      backgroundThrottling: false
    },
  })

  // --- SOLUÇÃO DO PROBLEMA DE PERMISSÃO --- //
  
  // 1. Auto-aprovar pedidos de permissão (Microfone/Câmera)
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // Para MVP, aprovamos tudo. Em produção, você filtraria.
    callback(true);
  });

  // 2. Configurar o pedido de captura de tela
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Dá permissão para capturar vídeo e áudio da tela escolhida
      callback({ video: sources[0], audio: 'loopback' })
    }).catch((err) => {
      console.error(err)
    })
  });

  // ---------------------------------------- //

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  
  // Abre o console de desenvolvedor para vermos erros reais (Opcional)
  // win.webContents.openDevTools() 
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})