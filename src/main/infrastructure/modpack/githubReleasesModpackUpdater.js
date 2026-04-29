const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

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

function safeRm(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (_error) {
    // ignore
  }
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDirectory(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function requestJson(url, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'launcher-modpack',
          ...headers
        }
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers && res.headers.location ? String(res.headers.location) : null;
        if (location && [301, 302, 303, 307, 308].includes(status)) {
          res.resume();
          const nextUrl = location.startsWith('http') ? location : new URL(location, url).toString();
          requestJson(nextUrl, { headers }).then(resolve).catch(reject);
          return;
        }
        if (status < 200 || status >= 300) {
          const error = new Error(`HTTP ${status} while requesting ${url}`);
          error.code = 'EHTTP';
          res.resume();
          reject(error);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on('error', reject);
  });
}

function downloadToFile(url, targetFilePath, { headers = {}, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    ensureDirectory(path.dirname(targetFilePath));
    const out = fs.createWriteStream(targetFilePath);
    let finished = false;

    const fail = (error) => {
      if (finished) return;
      finished = true;
      try {
        out.close();
      } catch (_closeError) {
        // ignore
      }
      try {
        fs.unlinkSync(targetFilePath);
      } catch (_unlinkError) {
        // ignore
      }
      reject(error);
    };

    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'launcher-modpack',
          ...headers
        }
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers && res.headers.location ? String(res.headers.location) : null;
        if (location && [301, 302, 303, 307, 308].includes(status)) {
          res.resume();
          out.close();
          const nextUrl = location.startsWith('http') ? location : new URL(location, url).toString();
          downloadToFile(nextUrl, targetFilePath, { headers, onProgress }).then(resolve).catch(reject);
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          fail(new Error(`HTTP ${status} while downloading ${url}`));
          return;
        }

        const totalBytesHeader = res.headers && res.headers['content-length'] ? Number(res.headers['content-length']) : 0;
        const totalBytes = Number.isFinite(totalBytesHeader) ? totalBytesHeader : 0;
        let downloaded = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (typeof onProgress === 'function') {
            onProgress({
              phase: 'download',
              downloadedBytes: downloaded,
              totalBytes: totalBytes > 0 ? totalBytes : null
            });
          }
        });

        res.pipe(out);
        out.on('finish', () => {
          if (finished) return;
          finished = true;
          out.close(() => resolve({ bytes: downloaded, totalBytes: totalBytes > 0 ? totalBytes : null }));
        });
      }
    );

    req.on('error', fail);
    out.on('error', fail);
  });
}

function extractZip(zipPath, targetDir) {
  ensureDirectory(targetDir);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
}

function normalizeExtractedModpackRoot(extractDir) {
  // Supports either:
  // - extractDir/<pack-folders>
  // - extractDir/<something>/<pack-folders>
  const packFolders = ['mods', 'config', 'shaderpacks', 'resourcepacks'];
  const rootDirents = fs.readdirSync(extractDir, { withFileTypes: true });
  const rootDirs = rootDirents.filter((e) => e.isDirectory());
  const rootFiles = rootDirents.filter((e) => e.isFile());
  const rootPresent = packFolders.filter((name) => fs.existsSync(path.join(extractDir, name)));

  // If there are real files at the root, keep it (pack is probably already in the right place).
  if (rootFiles.length > 0) return extractDir;

  // If root contains multiple pack folders, it is the pack root.
  if (rootPresent.length >= 2) return extractDir;

  // If root contains exactly one pack folder AND also exactly one directory total,
  // treat it as a wrapper folder and try to detect the actual pack inside.
  if (rootDirs.length === 1) {
    const nested = path.join(extractDir, rootDirs[0].name);
    try {
      const nestedPresent = packFolders.filter((name) => fs.existsSync(path.join(nested, name)));
      if (nestedPresent.length >= 2) return nested;
      // Also accept a nested pack if it contains any pack folder AND the root only had a single pack folder.
      if (nestedPresent.length >= 1 && rootPresent.length === 1) return nested;
    } catch (_error) {
      // ignore and fallback
    }
  }

  // If root contains any pack folder (even one), assume it's the pack root.
  if (rootPresent.length >= 1) return extractDir;

  // Otherwise, if root has a single directory, we can attempt to use it as pack root.
  if (rootDirs.length === 1) return path.join(extractDir, rootDirs[0].name);

  return extractDir;
}

function createGithubReleasesModpackUpdater() {
  const stateFileName = '_modpack_remote_state.json';
  const remoteDirName = '_modpack_remote';

  return {
    getRemoteSourceRoot({ launcherRoot }) {
      const remoteRoot = path.join(launcherRoot, remoteDirName);
      return remoteRoot;
    },

    readLocalState({ launcherRoot }) {
      const statePath = path.join(launcherRoot, stateFileName);
      return readJsonIfExists(statePath);
    },

    async ensureLatestReleaseExtracted({ launcherRoot, owner, repo, assetName, onProgress }) {
      if (!owner || !repo || !assetName) {
        return {
          ok: false,
          updated: false,
          message: 'ยังไม่ได้ตั้งค่า GitHub owner/repo/assetName สำหรับ modpack update'
        };
      }

      const statePath = path.join(launcherRoot, stateFileName);
      const remoteRoot = path.join(launcherRoot, remoteDirName);
      const tmpZipPath = path.join(launcherRoot, '_modpack_remote_download.zip');
      const tmpExtractDir = path.join(launcherRoot, '_modpack_remote_next');

      ensureDirectory(launcherRoot);
      if (typeof onProgress === 'function') onProgress({ phase: 'check', percent: 2, label: 'ตรวจสอบเวอร์ชันม็อดแพ็ก...' });

      const release = await requestJson(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
      const tag = release && release.tag_name ? String(release.tag_name) : null;
      const assets = release && Array.isArray(release.assets) ? release.assets : [];
      const asset = assets.find((a) => a && a.name === assetName) || null;

      if (!tag || !asset || !asset.id) {
        return {
          ok: false,
          updated: false,
          message: `ไม่พบ asset ชื่อ ${assetName} ใน GitHub Release ล่าสุด`
        };
      }

      const localState = readJsonIfExists(statePath);
      if (localState && localState.tag === tag && fs.existsSync(remoteRoot)) {
        if (typeof onProgress === 'function') onProgress({ phase: 'done', percent: 100, label: `ม็อดแพ็กเป็นเวอร์ชันล่าสุดแล้ว (${tag})` });
        return { ok: true, updated: false, tag, remoteRoot };
      }

      if (typeof onProgress === 'function') onProgress({ phase: 'download', percent: 8, label: `กำลังดาวน์โหลดม็อดแพ็ก (${tag})...` });

      safeRm(tmpZipPath);
      safeRm(tmpExtractDir);

      const downloadUrl = asset && asset.url ? String(asset.url) : null;
      if (!downloadUrl) {
        return { ok: false, updated: false, message: 'ไม่พบ URL สำหรับดาวน์โหลด asset' };
      }

      await downloadToFile(downloadUrl, tmpZipPath, {
        headers: {},
        onProgress: (p) => {
          if (typeof onProgress !== 'function') return;
          if (!p || p.phase !== 'download') return;
          const percent = p.totalBytes ? 8 + (p.downloadedBytes / p.totalBytes) * 62 : 35;
          onProgress({
            phase: 'download',
            percent: Math.max(8, Math.min(70, percent)),
            label: 'กำลังดาวน์โหลดม็อดแพ็ก...',
            downloadedBytes: p.downloadedBytes,
            totalBytes: p.totalBytes
          });
        }
      });

      if (typeof onProgress === 'function') onProgress({ phase: 'extract', percent: 74, label: 'กำลังแตกไฟล์ม็อดแพ็ก...' });
      ensureDirectory(tmpExtractDir);
      extractZip(tmpZipPath, tmpExtractDir);

      const normalizedRoot = normalizeExtractedModpackRoot(tmpExtractDir);

      // Swap into place atomically (best-effort on Windows).
      safeRm(`${remoteRoot}.old`);
      if (fs.existsSync(remoteRoot)) {
        try {
          fs.renameSync(remoteRoot, `${remoteRoot}.old`);
        } catch (_error) {
          safeRm(remoteRoot);
        }
      }
      safeRm(remoteRoot);
      fs.renameSync(normalizedRoot, remoteRoot);
      safeRm(`${remoteRoot}.old`);

      writeJsonAtomic(statePath, {
        tag,
        assetName,
        assetId: asset.id,
        updatedAt: new Date().toISOString()
      });

      safeRm(tmpZipPath);
      safeRm(tmpExtractDir);

      if (typeof onProgress === 'function') onProgress({ phase: 'done', percent: 100, label: `อัปเดตม็อดแพ็กสำเร็จ (${tag})` });
      return { ok: true, updated: true, tag, remoteRoot };
    }
  };
}

module.exports = {
  createGithubReleasesModpackUpdater
};

