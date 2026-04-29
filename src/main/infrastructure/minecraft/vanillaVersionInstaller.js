const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const status = res.statusCode || 0;
        const location = res.headers && res.headers.location ? String(res.headers.location) : null;
        if (location && [301, 302, 303, 307, 308].includes(status)) {
          res.resume();
          const nextUrl = location.startsWith('http') ? location : new URL(location, url).toString();
          downloadBuffer(nextUrl).then(resolve).catch(reject);
          return;
        }
        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status} while downloading ${url}`));
          res.resume();
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(error) {
  const code = error && error.code ? String(error.code) : '';
  return (
    code === 'EAI_AGAIN' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED'
  );
}

async function downloadBufferWithRetry(url, { retries = 6, baseDelayMs = 600 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await downloadBuffer(url);
    } catch (error) {
      if (attempt >= retries || !isRetryableNetworkError(error)) throw error;
      const backoff = Math.min(8000, baseDelayMs * 2 ** attempt);
      attempt += 1;
      await sleep(backoff);
    }
  }
}

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

async function ensureVanillaVersionInstalled({ launcherRoot, gameVersion }) {
  const versionsDir = path.join(launcherRoot, 'versions');
  const versionDir = path.join(versionsDir, gameVersion);
  const versionJsonPath = path.join(versionDir, `${gameVersion}.json`);
  const versionJarPath = path.join(versionDir, `${gameVersion}.jar`);

  ensureDirectory(launcherRoot);
  ensureDirectory(versionsDir);
  ensureDirectory(versionDir);

  const jsonOk = fs.existsSync(versionJsonPath) && fs.statSync(versionJsonPath).size > 0;
  const jarOk = fs.existsSync(versionJarPath) && fs.statSync(versionJarPath).size > 0;
  if (jsonOk && jarOk) {
    return { ok: true, installed: false, versionDir };
  }

  // Prefer piston-meta (new Mojang endpoints).
  const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
  const manifest = JSON.parse((await downloadBufferWithRetry(manifestUrl)).toString('utf8'));
  const entry = Array.isArray(manifest.versions)
    ? manifest.versions.find((v) => v && v.id === gameVersion)
    : null;

  if (!entry || !entry.url) {
    const error = new Error(`Unknown Minecraft version: ${gameVersion}`);
    error.code = 'ENOENT';
    error.path = versionDir;
    throw error;
  }

  const versionMeta = JSON.parse((await downloadBufferWithRetry(entry.url)).toString('utf8'));
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionMeta, null, 2), 'utf8');

  const jarUrl =
    versionMeta &&
    versionMeta.downloads &&
    versionMeta.downloads.client &&
    versionMeta.downloads.client.url
      ? String(versionMeta.downloads.client.url)
      : null;

  if (!jarUrl) {
    const error = new Error(`Missing client download url for Minecraft ${gameVersion}`);
    error.code = 'ENOENT';
    error.path = versionJsonPath;
    throw error;
  }

  const jarBuffer = await downloadBufferWithRetry(jarUrl);
  fs.writeFileSync(versionJarPath, jarBuffer);

  // Validate the jar is a readable zip (guards against HTML error pages / partial downloads)
  try {
    const stat = fs.statSync(versionJarPath);
    if (!stat.isFile() || stat.size < 1024 * 256) {
      throw new Error(`jar too small: ${stat.size} bytes`);
    }
    const zip = new AdmZip(versionJarPath);
    const entries = zip.getEntries();
    if (!entries || entries.length < 200) {
      throw new Error(`jar has too few entries: ${entries ? entries.length : 0}`);
    }
  } catch (error) {
    try {
      fs.unlinkSync(versionJarPath);
    } catch (_unlinkError) {
      // ignore
    }
    const nextError = new Error(
      `Minecraft ${gameVersion} client jar seems corrupted. Deleted and will retry next launch. (${error.message})`
    );
    nextError.code = 'EIO';
    nextError.path = versionJarPath;
    throw nextError;
  }

  return { ok: true, installed: true, versionDir };
}

module.exports = {
  ensureVanillaVersionInstalled
};

