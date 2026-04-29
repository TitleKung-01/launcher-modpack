const { app } = require('electron');
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
