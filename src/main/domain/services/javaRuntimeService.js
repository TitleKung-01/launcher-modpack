function parseJavaMajor(versionOutput) {
  const match = versionOutput.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2] || '0');
  return first === 1 ? second : first;
}

module.exports = {
  parseJavaMajor
};
