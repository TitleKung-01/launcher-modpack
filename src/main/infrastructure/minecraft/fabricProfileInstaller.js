const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

function parseFabricCustomId(customId) {
  const prefix = 'fabric-loader-';
  if (!customId || typeof customId !== 'string' || !customId.startsWith(prefix)) return null;

  const rest = customId.slice(prefix.length);
  const splitAt = rest.lastIndexOf('-');
  if (splitAt <= 0 || splitAt >= rest.length - 1) return null;

  return {
    loaderVersion: rest.slice(0, splitAt),
    gameVersion: rest.slice(splitAt + 1)
  };
}

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

async function ensureFabricProfileInstalled({ launcherRoot, customId }) {
  const parsed = parseFabricCustomId(customId);
  if (!parsed) {
    return { ok: true, installed: false, reason: 'not-fabric-custom-id' };
  }

  const versionsDir = path.join(launcherRoot, 'versions');
  const versionDir = path.join(versionsDir, customId);
  const expectedJsonPath = path.join(versionDir, `${customId}.json`);
  const expectedJarPath = path.join(versionDir, `${customId}.jar`);
  const nestedVersionDir = path.join(versionDir, customId);
  const nestedExpectedJsonPath = path.join(nestedVersionDir, `${customId}.json`);

  const jsonExists = fs.existsSync(expectedJsonPath);
  let jarLooksValid = false;
  let jarHasLoaderClasses = false;
  try {
    if (fs.existsSync(expectedJarPath)) {
      const stat = fs.statSync(expectedJarPath);
      jarLooksValid = stat.isFile() && stat.size > 0;
    }
  } catch (_error) {
    jarLooksValid = false;
  }

  if (jarLooksValid) {
    try {
      const jarZip = new AdmZip(expectedJarPath);
      jarHasLoaderClasses = jarZip
        .getEntries()
        .some((e) => e && typeof e.entryName === 'string' && /net\/fabricmc\/loader\//i.test(e.entryName));
    } catch (_error) {
      jarLooksValid = false;
      jarHasLoaderClasses = false;
    }
  }

  if (jsonExists && jarLooksValid && !jarHasLoaderClasses) {
    return { ok: true, installed: false, versionDir };
  }

  ensureDirectory(launcherRoot);
  ensureDirectory(versionsDir);
  ensureDirectory(versionDir);

  const zipUrl = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(
    parsed.gameVersion
  )}/${encodeURIComponent(parsed.loaderVersion)}/profile/zip`;

  const zipBuffer = await downloadBuffer(zipUrl);
  const zip = new AdmZip(zipBuffer);
  // Fabric profile zip contains a top-level folder named after the customId
  // e.g. fabric-loader-x.y.z-mcver/fabric-loader-x.y.z-mcver.json
  zip.extractAllTo(versionsDir, true);

  if (!fs.existsSync(expectedJsonPath) && fs.existsSync(nestedExpectedJsonPath)) {
    // Older extraction behavior or manual copies might produce versions/<id>/<id>/<id>.json
    // Normalize to versions/<id>/<id>.json which is what MCLC expects.
    fs.readdirSync(nestedVersionDir, { withFileTypes: true }).forEach((entry) => {
      const from = path.join(nestedVersionDir, entry.name);
      const to = path.join(versionDir, entry.name);
      fs.renameSync(from, to);
    });
    fs.rmdirSync(nestedVersionDir);
  }

  if (!fs.existsSync(expectedJsonPath)) {
    const error = new Error(
      `Fabric profile extracted but missing ${expectedJsonPath} (downloaded from ${zipUrl})`
    );
    error.code = 'ENOENT';
    error.path = expectedJsonPath;
    throw error;
  }

  // The version jar in versions/<customId>/ is expected to be a small stub.
  // In our MCLC setup, the custom version jar is the only "version jar" that ends up on the classpath.
  // If it is just a stub, Fabric cannot locate the game. So we normalize it to contain the vanilla client jar.
  // Also, if it incorrectly contains loader classes it will cause duplicate classpath issues.
  let needsStubJar = false;
  try {
    if (!fs.existsSync(expectedJarPath)) {
      needsStubJar = true;
    } else {
      const stat = fs.statSync(expectedJarPath);
      if (!stat.isFile() || stat.size === 0) {
        needsStubJar = true;
      } else {
        const jarZip = new AdmZip(expectedJarPath);
        const hasLoader = jarZip
          .getEntries()
          .some((e) => e && typeof e.entryName === 'string' && /net\/fabricmc\/loader\//i.test(e.entryName));
        if (hasLoader) needsStubJar = true;
      }
    }
  } catch (_error) {
    needsStubJar = true;
  }

  const vanillaJarPath = path.join(
    launcherRoot,
    'versions',
    parsed.gameVersion,
    `${parsed.gameVersion}.jar`
  );

  let vanillaJarLooksValid = false;
  try {
    if (fs.existsSync(vanillaJarPath)) {
      const stat = fs.statSync(vanillaJarPath);
      if (stat.isFile() && stat.size > 1024 * 256) {
        const zip = new AdmZip(vanillaJarPath);
        vanillaJarLooksValid = zip
          .getEntries()
          .some((e) => e && e.entryName === 'net/minecraft/client/main/Main.class');
      }
    }
  } catch (_error) {
    vanillaJarLooksValid = false;
  }

  if (vanillaJarLooksValid) {
    // Ensure the fabric version jar is a copy of the vanilla client jar so Fabric can locate the game.
    // Only overwrite when it's missing/invalid/stub, or when it contains loader classes.
    const shouldOverwriteWithVanilla = needsStubJar || !jarLooksValid || jarHasLoaderClasses;
    if (shouldOverwriteWithVanilla) {
      fs.copyFileSync(vanillaJarPath, expectedJarPath);
    }
  } else if (needsStubJar) {
    // Fallback: at least create a valid jar so Java doesn't crash on "zip file is empty".
    const stubJar = new AdmZip();
    stubJar.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\r\n', 'utf8'));
    stubJar.writeZip(expectedJarPath);
  }

  return { ok: true, installed: true, versionDir };
}

module.exports = {
  ensureFabricProfileInstalled,
  parseFabricCustomId
};

