const { app } = require('electron');
const dns = require('dns');
const { createMainWindow } = require('./presentation/window/createMainWindow');
const { registerLauncherIpc } = require('./presentation/ipc/registerLauncherIpc');
const javaGateway = require('./infrastructure/system/javaGateway');
const javaInstallerGateway = require('./infrastructure/system/javaInstallerGateway');
const minecraftGateway = require('./infrastructure/minecraft/minecraftLauncherGateway');
const { createJavaUseCases } = require('./application/use-cases/javaUseCases');
const { createStartMinecraftUseCase } = require('./application/use-cases/startMinecraftUseCase');

const javaUseCases = createJavaUseCases({
  javaGateway,
  javaInstallerGateway
});

const startMinecraftUseCase = createStartMinecraftUseCase({
  javaGateway,
  minecraftGateway
});

function bootstrapMainProcess() {
  // Mitigates intermittent "Client network socket disconnected before secure TLS connection was established"
  // on some Windows networks when Node prefers IPv6.
  try {
    if (typeof dns.setDefaultResultOrder === 'function') {
      dns.setDefaultResultOrder('ipv4first');
    }
  } catch (_error) {
    // ignore
  }

  app.whenReady().then(() => {
    // Helps Windows pick the right taskbar icon + group.
    app.setAppUserModelId('com.mryos.launchermodpack');
    createMainWindow();
    registerLauncherIpc({
      javaUseCases,
      startMinecraftUseCase,
      minecraftGateway
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = {
  bootstrapMainProcess
};
