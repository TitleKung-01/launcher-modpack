const { Client, Authenticator } = require('minecraft-launcher-core');
const { createModpackSyncGateway } = require('../modpack/modpackSyncGateway');
const { ensureFabricProfileInstalled } = require('./fabricProfileInstaller');
const { ensureVanillaVersionInstalled } = require('./vanillaVersionInstaller');

const launcher = new Client();
const modpackSyncGateway = createModpackSyncGateway();
let logHandler = null;
let isLoggingAttached = false;
let gameState = 'idle';
let stateHandler = null;

function emitState(nextState) {
  if (gameState === nextState) return;
  gameState = nextState;
  if (stateHandler) stateHandler(gameState);
}

function createOfflineAuth(username) {
  return Authenticator.getAuth(username);
}

function launchMinecraft(opts) {
  emitState('launching');
  launcher.launch(opts);
}

async function ensureLoaderProfiles({ launcherRoot, version }) {
  if (!version || !version.custom) return { ok: true, installed: false };
  return ensureFabricProfileInstalled({ launcherRoot, customId: version.custom });
}

async function ensureGameVersionInstalled({ launcherRoot, version }) {
  if (!version || !version.number) return { ok: true, installed: false };
  return ensureVanillaVersionInstalled({ launcherRoot, gameVersion: version.number });
}

function attachLauncherLogging() {
  if (isLoggingAttached) return;
  isLoggingAttached = true;

  launcher.on('debug', (event) => {
    const message = String(event);
    console.log(message);
    if (logHandler) logHandler('debug', message);
    if (/Sound engine started/i.test(message)) emitState('running');
    if (/Stopping!/i.test(message)) emitState('idle');
  });

  launcher.on('data', (event) => {
    const message = String(event);
    console.log(message);
    if (logHandler) logHandler('data', message);
    if (/Sound engine started/i.test(message)) emitState('running');
    if (/Stopping!/i.test(message)) emitState('idle');
  });
}

function setLogHandler(handler) {
  logHandler = handler;
}

function setStateHandler(handler) {
  stateHandler = handler;
  if (stateHandler) stateHandler(gameState);
}

function getGameState() {
  return gameState;
}

function syncModpack(options) {
  return modpackSyncGateway.syncModpack(options);
}

module.exports = {
  createOfflineAuth,
  launchMinecraft,
  ensureGameVersionInstalled,
  ensureLoaderProfiles,
  attachLauncherLogging,
  setLogHandler,
  setStateHandler,
  getGameState,
  syncModpack
};
