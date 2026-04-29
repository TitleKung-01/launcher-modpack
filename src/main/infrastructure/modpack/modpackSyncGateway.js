const fs = require('fs');
const path = require('path');

function ensureDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      const error = new Error(`Expected a directory but found a file: ${dirPath}`);
      error.code = 'ENOTDIR';
      error.path = dirPath;
      throw error;
    }
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDirectoryForSync(dirPath) {
  // Same as ensureDirectory, but helps diagnose "mods/config is a file" cases.
  ensureDirectory(dirPath);
}

function collectFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  if (!fs.statSync(rootDir).isDirectory()) {
    const error = new Error(`Expected a directory but found a file: ${rootDir}`);
    error.code = 'ENOTDIR';
    error.path = rootDir;
    throw error;
  }

  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    entries.forEach((entry) => {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        return;
      }
      if (entry.name === '.gitkeep') return;
      files.push(absolutePath);
    });
  }

  return files;
}

function toRelativePosix(baseDir, absolutePath) {
  return path.relative(baseDir, absolutePath).split(path.sep).join('/');
}

function shouldCopy(sourcePath, targetPath) {
  if (!fs.existsSync(targetPath)) return true;

  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.statSync(targetPath);

  if (sourceStat.size !== targetStat.size) return true;
  return sourceStat.mtimeMs > targetStat.mtimeMs;
}

function deleteEmptyDirectories(startDir) {
  if (!fs.existsSync(startDir)) return;

  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  entries.forEach((entry) => {
    if (!entry.isDirectory()) return;
    const child = path.join(startDir, entry.name);
    deleteEmptyDirectories(child);
  });

  if (fs.readdirSync(startDir).length === 0) {
    fs.rmdirSync(startDir);
  }
}

function syncDirectory({ sourceDir, targetDir }) {
  ensureDirectoryForSync(targetDir);
  // Source is optional; if it's missing we skip sync rather than trying to create it
  // (important for packaged apps where source could live inside asar).
  if (!fs.existsSync(sourceDir)) {
    return { copied: 0, removed: 0 };
  }
  if (!fs.statSync(sourceDir).isDirectory()) {
    const error = new Error(`Expected a directory but found a file: ${sourceDir}`);
    error.code = 'ENOTDIR';
    error.path = sourceDir;
    throw error;
  }

  const sourceFiles = collectFiles(sourceDir);
  const sourceRelativeSet = new Set(sourceFiles.map((file) => toRelativePosix(sourceDir, file)));

  let copied = 0;
  sourceFiles.forEach((sourceFilePath) => {
    const relativePath = toRelativePosix(sourceDir, sourceFilePath);
    const targetFilePath = path.join(targetDir, relativePath);
    ensureDirectoryForSync(path.dirname(targetFilePath));

    if (shouldCopy(sourceFilePath, targetFilePath)) {
      fs.copyFileSync(sourceFilePath, targetFilePath);
      copied += 1;
    }
  });

  const targetFiles = collectFiles(targetDir);
  let removed = 0;
  targetFiles.forEach((targetFilePath) => {
    const relativePath = toRelativePosix(targetDir, targetFilePath);
    if (sourceRelativeSet.has(relativePath)) return;
    fs.unlinkSync(targetFilePath);
    removed += 1;
  });

  deleteEmptyDirectories(targetDir);
  ensureDirectoryForSync(targetDir);

  return { copied, removed };
}

function writeModListFile({ sourceModsDir, launcherRoot, modListFileName }) {
  const modFiles = collectFiles(sourceModsDir)
    .map((filePath) => {
      const stat = fs.statSync(filePath);
      return {
        file: toRelativePosix(sourceModsDir, filePath),
        size: stat.size
      };
    })
    .sort((left, right) => left.file.localeCompare(right.file));

  const modListPath = path.join(launcherRoot, modListFileName);
  fs.writeFileSync(
    modListPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalMods: modFiles.length,
        mods: modFiles
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    modListPath,
    totalMods: modFiles.length
  };
}

function createModpackSyncGateway() {
  return {
    syncModpack({
      launcherRoot,
      sourceRoot,
      modsFolderName,
      configFolderName,
      shaderpacksFolderName,
      resourcepacksFolderName,
      modListFileName
    }) {
      ensureDirectoryForSync(launcherRoot);

      const sourceModsDir = path.join(sourceRoot, modsFolderName);
      const sourceConfigDir = path.join(sourceRoot, configFolderName);
      const sourceShaderpacksDir = shaderpacksFolderName ? path.join(sourceRoot, shaderpacksFolderName) : null;
      const sourceResourcepacksDir = resourcepacksFolderName ? path.join(sourceRoot, resourcepacksFolderName) : null;
      const targetModsDir = path.join(launcherRoot, modsFolderName);
      const targetConfigDir = path.join(launcherRoot, configFolderName);
      const targetShaderpacksDir = shaderpacksFolderName ? path.join(launcherRoot, shaderpacksFolderName) : null;
      const targetResourcepacksDir = resourcepacksFolderName ? path.join(launcherRoot, resourcepacksFolderName) : null;

      const modsResult = syncDirectory({
        sourceDir: sourceModsDir,
        targetDir: targetModsDir
      });
      const configResult = syncDirectory({
        sourceDir: sourceConfigDir,
        targetDir: targetConfigDir
      });
      const shaderpacksResult =
        sourceShaderpacksDir && targetShaderpacksDir
          ? syncDirectory({ sourceDir: sourceShaderpacksDir, targetDir: targetShaderpacksDir })
          : { copied: 0, removed: 0 };
      const resourcepacksResult =
        sourceResourcepacksDir && targetResourcepacksDir
          ? syncDirectory({ sourceDir: sourceResourcepacksDir, targetDir: targetResourcepacksDir })
          : { copied: 0, removed: 0 };
      const modListResult = writeModListFile({
        sourceModsDir,
        launcherRoot,
        modListFileName
      });

      return {
        mods: modsResult,
        config: configResult,
        shaderpacks: shaderpacksResult,
        resourcepacks: resourcepacksResult,
        modList: modListResult
      };
    }
  };
}

module.exports = {
  createModpackSyncGateway
};
