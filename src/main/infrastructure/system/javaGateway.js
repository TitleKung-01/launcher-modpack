const path = require('path');
const { spawnSync } = require('child_process');
const { parseJavaMajor } = require('../../domain/services/javaRuntimeService');

function detectJava() {
  const isWin = process.platform === 'win32';
  const envJava = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', isWin ? 'javaw.exe' : 'java')
    : null;
  const javaPath = envJava || (isWin ? 'javaw' : 'java');
  const versionProbe = spawnSync(javaPath, ['-version'], { encoding: 'utf8' });
  const versionText = `${versionProbe.stdout || ''}\n${versionProbe.stderr || ''}`;

  return {
    javaPath,
    major: parseJavaMajor(versionText)
  };
}

module.exports = {
  detectJava
};
