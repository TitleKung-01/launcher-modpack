const { spawn } = require('child_process');

function installJava21() {
  return new Promise((resolve, reject) => {
    const installCommand =
      "$p = Start-Process winget -ArgumentList 'install EclipseAdoptium.Temurin.21.JDK --accept-source-agreements --accept-package-agreements' -Verb RunAs -Wait -PassThru; exit $p.ExitCode";

    const child = spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', installCommand],
      { windowsHide: true }
    );

    child.on('error', (error) => reject(error));
    child.on('close', (code) => resolve(code));
  });
}

module.exports = {
  installJava21
};
