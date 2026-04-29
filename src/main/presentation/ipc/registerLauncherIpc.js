const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { launcherConfig } = require('../../infrastructure/config/launcherConfig');
const { createGithubReleasesModpackUpdater } = require('../../infrastructure/modpack/githubReleasesModpackUpdater');

const modpackUpdater = createGithubReleasesModpackUpdater();

function mapMclcProgress(message) {
  if (/MCLC version/i.test(message)) return { percent: 5, label: 'เริ่มต้น Launcher' };
  if (/Using Java version/i.test(message)) return { percent: 14, label: 'ตรวจสอบ Java' };
  if (/Collected class paths/i.test(message)) return { percent: 26, label: 'เตรียม classpath' };
  if (/Attempting to download assets/i.test(message)) return { percent: 40, label: 'กำลังดาวน์โหลด assets' };
  if (/Downloaded assets/i.test(message)) return { percent: 62, label: 'ดาวน์โหลด assets สำเร็จ' };
  if (/Set launch options/i.test(message)) return { percent: 76, label: 'กำหนดค่าเปิดเกม' };
  if (/Launching with arguments/i.test(message)) return { percent: 88, label: 'กำลังสตาร์ท Minecraft' };
  if (/Setting user:/i.test(message)) return { percent: 96, label: 'เข้าสู่ระบบผู้เล่น' };
  if (/Sound engine started/i.test(message)) return { percent: 100, label: 'เปิดเกมสำเร็จ' };
  return null;
}

function registerLauncherIpc({ javaUseCases, startMinecraftUseCase, minecraftGateway }) {
  let stateSender = null;
  const mclcLogPath = path.join(launcherConfig.root, 'launcher-mclc.log');
  const logBuffer = [];
  const maxBufferedLines = 2000;

  ipcMain.handle('check-java', () => javaUseCases.checkJava());
  ipcMain.handle('install-java-21', () => javaUseCases.installJava21());
  ipcMain.handle('get-game-state', () => minecraftGateway.getGameState());
  ipcMain.handle('ensure-modpack-updated', async (event) => {
    const sender = event && event.sender ? event.sender : null;
    const sendProgress = (payload) => {
      if (!sender || sender.isDestroyed()) return;
      sender.send('modpack-update-progress', payload);
    };

    try {
      const repo = launcherConfig.modpack && launcherConfig.modpack.githubReleases ? launcherConfig.modpack.githubReleases : null;
      const result = await modpackUpdater.ensureLatestReleaseExtracted({
        launcherRoot: launcherConfig.root,
        owner: repo ? repo.owner : '',
        repo: repo ? repo.repo : '',
        assetName: repo ? repo.assetName : 'modpack.zip',
        onProgress: (p) => sendProgress(p)
      });
      return result;
    } catch (error) {
      const message = error && error.message ? error.message : 'อัปเดตม็อดแพ็กไม่สำเร็จ';
      sendProgress({ phase: 'error', percent: 0, label: message });
      return { ok: false, updated: false, message };
    }
  });
  ipcMain.handle('get-mclc-log', async () => {
    try {
      if (fs.existsSync(mclcLogPath)) {
        return fs.readFileSync(mclcLogPath, 'utf8');
      }
    } catch (_error) {
      // ignore read issues
    }
    return logBuffer.join('\n');
  });
  ipcMain.handle('clear-mclc-log', async () => {
    logBuffer.length = 0;
    try {
      if (fs.existsSync(mclcLogPath)) fs.unlinkSync(mclcLogPath);
    } catch (_error) {
      // ignore delete issues
    }
    return { ok: true };
  });
  minecraftGateway.attachLauncherLogging();
  minecraftGateway.setStateHandler((state) => {
    if (!stateSender || stateSender.isDestroyed()) return;
    stateSender.send('game-state', { state });
  });

  ipcMain.on('subscribe-game-state', (event) => {
    stateSender = event.sender;
    stateSender.send('game-state', { state: minecraftGateway.getGameState() });
  });

  ipcMain.on('start-minecraft', (event, username) => {
    console.log(`ได้รับคำสั่งให้เปิดเกมในชื่อ: ${username}`);
    stateSender = event.sender;

    // Ack immediately so renderer doesn't timeout while preflight downloads happen.
    event.reply('launch-started', 'กำลังเตรียมไฟล์เกมและม็อด...');
    event.reply('launch-progress', { percent: 2, label: 'เตรียมไฟล์เกม' });

    minecraftGateway.setLogHandler((_level, message) => {
      logBuffer.push(`${new Date().toISOString()} ${message}`);
      if (logBuffer.length > maxBufferedLines) {
        logBuffer.splice(0, logBuffer.length - maxBufferedLines);
      }
      if (stateSender && !stateSender.isDestroyed()) {
        stateSender.send('mclc-log-line', { line: logBuffer[logBuffer.length - 1] });
      }
      try {
        fs.mkdirSync(launcherConfig.root, { recursive: true });
        fs.appendFileSync(mclcLogPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
      } catch (_error) {
        // ignore log write issues
      }
      const progress = mapMclcProgress(message);
      if (!progress) return;
      event.reply('launch-progress', progress);
      if (progress.percent >= 100) {
        event.reply('launch-ready', progress);
      }
    });

    Promise.resolve(startMinecraftUseCase(username))
      .then((result) => {
        if (!result || !result.ok) {
          event.reply('launch-error', result && result.message ? result.message : 'เริ่มเกมไม่สำเร็จ');
          return;
        }
        event.reply('launch-started', result.message || 'เริ่มเปิดเกมแล้ว');
      })
      .catch((error) => {
        const message = error && error.message ? error.message : 'เริ่มเกมไม่สำเร็จ';
        event.reply('launch-error', message);
      });
  });
}

module.exports = {
  registerLauncherIpc
};
