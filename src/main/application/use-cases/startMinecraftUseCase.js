const { launcherConfig } = require('../../infrastructure/config/launcherConfig');
const { createGithubReleasesModpackUpdater } = require('../../infrastructure/modpack/githubReleasesModpackUpdater');

const modpackUpdater = createGithubReleasesModpackUpdater();

function createStartMinecraftUseCase({ javaGateway, minecraftGateway }) {
  return async function startMinecraft(username) {
    try {
      const currentGameState = minecraftGateway.getGameState();
      if (currentGameState === 'launching' || currentGameState === 'running') {
        return {
          ok: false,
          message: 'เกมเปิดอยู่แล้ว กรุณาปิดเกมก่อนเริ่มใหม่'
        };
      }

      const javaInfo = javaGateway.detectJava();

      if (!javaInfo.major || javaInfo.major < 21) {
        return {
          ok: false,
          message: `ต้องใช้ Java 21 ขึ้นไป (ตอนนี้พบ Java ${javaInfo.major || 'unknown'}) - กรุณากดปุ่มติดตั้ง Java 21`
        };
      }

      await minecraftGateway.ensureGameVersionInstalled({
        launcherRoot: launcherConfig.root,
        version: launcherConfig.version
      });

      await minecraftGateway.ensureLoaderProfiles({
        launcherRoot: launcherConfig.root,
        version: launcherConfig.version
      });

      const remoteSourceRoot = modpackUpdater.getRemoteSourceRoot({ launcherRoot: launcherConfig.root });
      const preferRemote =
        remoteSourceRoot &&
        remoteSourceRoot !== launcherConfig.modpack.sourceRoot &&
        require('fs').existsSync(remoteSourceRoot);
      const resolvedSourceRoot = preferRemote ? remoteSourceRoot : launcherConfig.modpack.sourceRoot;

      const syncResult = minecraftGateway.syncModpack({
        launcherRoot: launcherConfig.root,
        sourceRoot: resolvedSourceRoot,
        modsFolderName: launcherConfig.modpack.modsFolderName,
        configFolderName: launcherConfig.modpack.configFolderName,
        shaderpacksFolderName: launcherConfig.modpack.shaderpacksFolderName,
        resourcepacksFolderName: launcherConfig.modpack.resourcepacksFolderName,
        modListFileName: launcherConfig.modpack.modListFileName
      });

      const authorization = minecraftGateway.createOfflineAuth(username);
      minecraftGateway.launchMinecraft({
        clientPackage: null,
        authorization,
        root: launcherConfig.root,
        version: launcherConfig.version,
        memory: launcherConfig.memory,
        javaPath: javaInfo.javaPath
      });

      return {
        ok: true,
        message: `ซิงก์ม็อด ${syncResult.modList.totalMods} ไฟล์แล้ว กำลังเปิดเกม Minecraft...`
      };
    } catch (error) {
      console.error('startMinecraft failed:', error);
      const hintPath = error && error.path ? ` (${error.path})` : '';
      if (error && (error.code === 'ENOTDIR' || error.code === 'EEXIST')) {
        return {
          ok: false,
          message: `เริ่มเกมไม่สำเร็จ: โฟลเดอร์ mods/config ผิดรูปแบบ${hintPath} (มีไฟล์ชื่อซ้ำกับโฟลเดอร์) กรุณาลบไฟล์นั้นแล้วลองใหม่`
        };
      }
      return {
        ok: false,
        message: `เริ่มเกมไม่สำเร็จ: ${error && error.message ? error.message : 'unknown error'}`
      };
    }
  };
}

module.exports = {
  createStartMinecraftUseCase
};
