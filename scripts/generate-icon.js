const fs = require('fs');
const path = require('path');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule && typeof pngToIcoModule.default === 'function'
  ? pngToIcoModule.default
  : pngToIcoModule;

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const sourcePng = path.join(projectRoot, 'image', 'Logo.png');
  const outDir = path.join(projectRoot, 'build');
  const outIco = path.join(outDir, 'icon.ico');

  if (!fs.existsSync(sourcePng)) {
    throw new Error(`Missing icon source: ${sourcePng}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const icoBuffer = await pngToIco(sourcePng);
  fs.writeFileSync(outIco, icoBuffer);
  console.log(`[generate-icon] wrote ${outIco}`);
}

main().catch((error) => {
  console.error('[generate-icon] failed:', error);
  process.exit(1);
});

