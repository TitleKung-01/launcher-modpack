const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

function createMainWindow() {
  const appPath = app.getAppPath();
  const packagedIcoPath = path.join(appPath, 'build', 'icon.ico');
  const fallbackPngPath = path.join(appPath, 'image', 'Logo.png');
  const windowIconPath = fs.existsSync(packagedIcoPath) ? packagedIcoPath : fallbackPngPath;

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: windowIconPath,
    webPreferences: {
      preload: path.join(appPath, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(appPath, 'index.html'));
  win.setMenuBarVisibility(false);
}

module.exports = {
  createMainWindow
};
