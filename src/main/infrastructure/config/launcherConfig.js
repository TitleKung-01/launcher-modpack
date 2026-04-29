const path = require('path');

const launcherConfig = {
  root: 'C:\\MineCraftLauncher',
  version: {
    number: '1.21.11',
    type: 'release',
    custom: 'fabric-loader-0.19.2-1.21.11'
  },
  memory: {
    max: '8G',
    min: '4G'
  },
  modpack: {
    sourceRoot: path.resolve(__dirname, '../../../modpack'),
    modsFolderName: 'mods',
    configFolderName: 'config',
    shaderpacksFolderName: 'shaderpacks',
    resourcepacksFolderName: 'resourcepacks',
    modListFileName: 'mod-list.json',
    githubReleases: {
      // ตั้งค่าให้เป็น repo ที่คุณปล่อย Release ไว้
      // ตัวอย่าง: owner: 'mryos', repo: 'my-modpack', assetName: 'modpack.zip'
      owner: 'TitleKung-01',
      repo: 'launcher-modpack',
      assetName: 'modpack.zip'
    }
  }
};

module.exports = {
  launcherConfig
};
