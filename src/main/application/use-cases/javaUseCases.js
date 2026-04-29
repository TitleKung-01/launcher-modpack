function createJavaUseCases({ javaGateway, javaInstallerGateway }) {
  async function checkJava() {
    return javaGateway.detectJava();
  }

  async function installJava21() {
    const beforeInstall = javaGateway.detectJava();
    if (beforeInstall.major && beforeInstall.major >= 21) {
      return { ok: true, message: 'Java 21 พร้อมใช้งานแล้ว' };
    }

    const exitCode = await javaInstallerGateway.installJava21();
    if (exitCode !== 0) {
      return {
        ok: false,
        message: `ติดตั้ง Java 21 ไม่สำเร็จ (exit code: ${exitCode})`
      };
    }

    const afterInstall = javaGateway.detectJava();
    if (afterInstall.major && afterInstall.major >= 21) {
      return { ok: true, message: 'ติดตั้ง Java 21 สำเร็จแล้ว' };
    }

    return {
      ok: false,
      message: 'ติดตั้งเสร็จแล้ว แต่ยังไม่พบ Java 21 กรุณาเปิดแอปใหม่'
    };
  }

  return {
    checkJava,
    installJava21
  };
}

module.exports = {
  createJavaUseCases
};
