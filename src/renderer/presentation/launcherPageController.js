function createLauncherPageController({ electronAPI, dom, alertApi }) {
  let launchAckTimer = null;
  let api = electronAPI;
  const usernameStorageKey = 'launcher-username';
  const defaultPlayButtonText = dom.playButton ? dom.playButton.innerText : 'เริ่มเล่นเกม';
  let loadingShownAt = 0;
  let loadingResetTimer = null;
  let currentGameState = 'idle';
  let statePollInterval = null;

  function showToast(message, tone) {
    alertApi(message, tone);
  }

  function animateStatus() {
    dom.statusText.classList.remove('status-animate');
    // Force reflow to replay animation on every update.
    void dom.statusText.offsetWidth;
    dom.statusText.classList.add('status-animate');
  }

  function setStatus(message, tone) {
    dom.statusText.innerText = message;
    dom.statusText.dataset.tone = tone;
    animateStatus();
  }

  function setButtonLoading(button, isLoading) {
    button.classList.toggle('loading', isLoading);
    button.disabled = isLoading;
  }

  function setPlayButtonLoading(isLoading) {
    if (loadingResetTimer) {
      clearTimeout(loadingResetTimer);
      loadingResetTimer = null;
    }

    if (isLoading) {
      loadingShownAt = Date.now();
      setButtonLoading(dom.playButton, true);
      dom.playButton.innerText = 'Loading...';
      dom.playButton.textContent = 'Loading...';
      return;
    }

    const elapsed = Date.now() - loadingShownAt;
    const minVisibleMs = 1000;
    if (elapsed < minVisibleMs) {
      loadingResetTimer = setTimeout(() => {
        setButtonLoading(dom.playButton, false);
        dom.playButton.innerText = defaultPlayButtonText;
        dom.playButton.textContent = defaultPlayButtonText;
      }, minVisibleMs - elapsed);
      return;
    }

    setButtonLoading(dom.playButton, isLoading);
    dom.playButton.innerText = defaultPlayButtonText;
    dom.playButton.textContent = defaultPlayButtonText;
  }

  function applyGameState(state) {
    currentGameState = state || 'idle';
    if (currentGameState === 'running' || currentGameState === 'launching') {
      setButtonLoading(dom.playButton, true);
      dom.playButton.innerText = 'เกมเปิดอยู่';
      dom.playButton.textContent = 'เกมเปิดอยู่';
      if (currentGameState === 'running') {
        setStatus('เกมเปิดอยู่', 'ok');
      } else {
        setStatus('เกมกำลังเปิดอยู่', 'warn');
      }
      return;
    }

    setButtonLoading(dom.playButton, false);
    dom.playButton.innerText = defaultPlayButtonText;
    dom.playButton.textContent = defaultPlayButtonText;
  }

  function startGameStatePolling() {
    if (typeof api.getGameState !== 'function') return;
    if (statePollInterval) clearInterval(statePollInterval);
    statePollInterval = setInterval(async () => {
      try {
        const state = await api.getGameState();
        applyGameState(state);
      } catch (_error) {
        // ignore transient ipc errors while app is closing/reloading
      }
    }, 2000);
  }

  function clearLaunchAckTimer() {
    if (launchAckTimer) {
      clearTimeout(launchAckTimer);
      launchAckTimer = null;
    }
  }

  function setProgress(percent) {
    const safePercent = Math.max(0, Math.min(100, percent));
    if (dom.progressGroup) dom.progressGroup.classList.remove('hidden');
    if (dom.progressFill) dom.progressFill.style.width = `${safePercent}%`;
    if (dom.progressText) dom.progressText.innerText = `${Math.round(safePercent)}%`;
  }

  function resetProgressHidden() {
    if (dom.progressGroup) dom.progressGroup.classList.add('hidden');
    if (dom.progressFill) dom.progressFill.style.width = '0%';
    if (dom.progressText) dom.progressText.innerText = '0%';
  }

  function startLaunchAckTimer() {
    clearLaunchAckTimer();
    launchAckTimer = setTimeout(() => {
      setPlayButtonLoading(false);
      setStatus('Launcher ไม่ตอบกลับการเริ่มเกม ลองกดใหม่ หรือปิดแล้วเปิด Launcher', 'error');
      showToast('ไม่ได้รับการตอบกลับจาก Launcher', 'error');
    }, 30000);
  }

  async function resolveElectronApi() {
    if (api && typeof api.launchGame === 'function') return api;

    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (window.electronAPI && typeof window.electronAPI.launchGame === 'function') {
        api = window.electronAPI;
        return api;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return null;
  }

  function cycleTheme() {
    const current = document.body.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = next;
    dom.themeToggleButton.innerText = next === 'dark' ? 'โหมดขาว' : 'โหมดดำ';
    window.localStorage.setItem('launcher-theme', next);
  }

  async function refreshJavaState() {
    const javaInfo = await api.checkJava();
    const hasJava21 = javaInfo.major && javaInfo.major >= 21;

    if (hasJava21) {
      dom.installJavaButton.style.display = 'none';
      setStatus(`Java ${javaInfo.major} พร้อมใช้งาน`, 'ok');
      return;
    }

    dom.installJavaButton.style.display = 'inline-block';
    setStatus(`ต้องใช้ Java 21 ขึ้นไป (ตอนนี้พบ Java ${javaInfo.major || 'unknown'})`, 'warn');
  }

  function bindPlayButton() {
    const startLaunch = async () => {
      const username = dom.usernameInput.value;

      if (username.trim() === '') {
        showToast('กรุณาใส่ชื่อผู้เล่นก่อน!', 'warn');
        return;
      }
      if (currentGameState === 'running' || currentGameState === 'launching') {
        setStatus('เกมเปิดอยู่แล้ว กรุณาปิดเกมก่อน', 'warn');
        showToast('เกมเปิดอยู่แล้ว', 'warn');
        return;
      }

      dom.playButton.classList.remove('start-press');
      void dom.playButton.offsetWidth;
      dom.playButton.classList.add('start-press');
      window.localStorage.setItem(usernameStorageKey, username.trim());
      setStatus('กำลังตรวจสอบ/อัปเดตม็อดแพ็ก...', 'warn');
      setPlayButtonLoading(true);
      setProgress(3);

      try {
        if (api && typeof api.ensureModpackUpdated === 'function') {
          const result = await api.ensureModpackUpdated();
          if (result && result.ok === false) {
            // Don't hard-block launch; allow fallback to bundled modpack when configured.
            const message = result.message || 'อัปเดตม็อดแพ็กไม่สำเร็จ (จะใช้ไฟล์ที่มีอยู่)';
            setStatus(message, 'warn');
            showToast(message, 'warn');
          }
        }
      } catch (_error) {
        setStatus('อัปเดตม็อดแพ็กไม่สำเร็จ (จะใช้ไฟล์ที่มีอยู่)', 'warn');
      }

      requestAnimationFrame(() => {
        api.launchGame(username);
        startLaunchAckTimer();
      });
    };

    dom.playButton.addEventListener('click', startLaunch);
    dom.usernameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      startLaunch();
    });
  }

  function bindInstallJavaButton() {
    dom.installJavaButton.addEventListener('click', async () => {
      setButtonLoading(dom.installJavaButton, true);
      setStatus('กำลังขอสิทธิ์แอดมินเพื่อติดตั้ง Java 21...', 'warn');

      try {
        const result = await api.installJava21();
        setStatus(result.message, result.ok ? 'ok' : 'warn');
        showToast(result.message, result.ok ? 'ok' : 'warn');
      } catch (_error) {
        const message = 'ไม่สามารถเริ่มการติดตั้ง Java 21 ได้';
        setStatus(message, 'error');
        showToast(message, 'error');
      } finally {
        setButtonLoading(dom.installJavaButton, false);
        await refreshJavaState();
      }
    });
  }

  function bindLaunchErrorListener() {
    api.onLaunchError((message) => {
      clearLaunchAckTimer();
      resetProgressHidden();
      setPlayButtonLoading(false);
      setStatus(message, 'error');
      showToast(message, 'error');
    });
  }

  function bindLaunchStartedListener() {
    api.onLaunchStarted((message) => {
      clearLaunchAckTimer();
      // Keep Loading state until launch-ready/error.
      setPlayButtonLoading(true);
      setStatus(message || 'เริ่มเปิดเกมแล้ว', 'ok');
      showToast(message || 'เริ่มเปิดเกมแล้ว', 'ok');
    });
  }

  function bindLaunchProgressListener() {
    if (typeof api.onLaunchProgress !== 'function') return;
    api.onLaunchProgress((payload) => {
      if (!payload || typeof payload.percent !== 'number') return;
      clearLaunchAckTimer();
      setProgress(payload.percent);
      if (payload.label) {
        setStatus(`${payload.label} (${Math.round(payload.percent)}%)`, 'warn');
      }
    });
  }

  function bindLaunchReadyListener() {
    if (typeof api.onLaunchReady !== 'function') return;
    api.onLaunchReady((payload) => {
      const message = payload && payload.label ? payload.label : 'เปิดเกมสำเร็จ';
      setProgress(100);
      setPlayButtonLoading(false);
      setStatus(message, 'ok');
    });
  }

  function bindModpackUpdateProgressListener() {
    if (!api || typeof api.onModpackUpdateProgress !== 'function') return;
    api.onModpackUpdateProgress((payload) => {
      if (!payload) return;
      if (typeof payload.percent === 'number') {
        setProgress(payload.percent);
      }
      if (payload.label) {
        setStatus(payload.label, payload.phase === 'error' ? 'error' : 'warn');
      }
    });
  }

  function bindThemeToggle() {
    if (!dom.themeToggleButton) return;
    dom.themeToggleButton.addEventListener('click', () => {
      cycleTheme();
      showToast('สลับธีมเรียบร้อย', 'ok');
    });
  }

  function bindGameStateListener() {
    if (typeof api.onGameState !== 'function') return;
    api.onGameState((payload) => {
      if (!payload || !payload.state) return;
      applyGameState(payload.state);
    });
  }

  function scrollLogToBottom() {
    if (!dom.logContent) return;
    dom.logContent.scrollTop = dom.logContent.scrollHeight;
  }

  async function refreshLog() {
    if (!dom.logContent || typeof api.getMclcLog !== 'function') return;
    try {
      const text = await api.getMclcLog();
      dom.logContent.textContent = text || '';
      scrollLogToBottom();
    } catch (_error) {
      dom.logContent.textContent = 'ไม่สามารถอ่าน log ได้';
    }
  }

  function setLogModalOpen(isOpen) {
    if (!dom.logModal) return;
    dom.logModal.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      refreshLog();
    }
  }

  function bindLogViewer() {
    if (!dom.viewLogButton || !dom.logModal || !dom.logContent) return;

    dom.viewLogButton.addEventListener('click', () => {
      setLogModalOpen(true);
    });
    if (dom.logCloseButton) {
      dom.logCloseButton.addEventListener('click', () => setLogModalOpen(false));
    }
    if (dom.logModalBackdrop) {
      dom.logModalBackdrop.addEventListener('click', () => setLogModalOpen(false));
    }

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!dom.logModal.classList.contains('hidden')) setLogModalOpen(false);
    });

    if (dom.logRefreshButton) {
      dom.logRefreshButton.addEventListener('click', () => refreshLog());
    }
    if (dom.logCopyButton) {
      dom.logCopyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(dom.logContent.textContent || '');
          showToast('คัดลอก log แล้ว', 'ok');
        } catch (_error) {
          showToast('คัดลอกไม่สำเร็จ', 'error');
        }
      });
    }
    if (dom.logClearButton) {
      dom.logClearButton.addEventListener('click', async () => {
        if (typeof api.clearMclcLog !== 'function') return;
        try {
          await api.clearMclcLog();
          dom.logContent.textContent = '';
          showToast('ล้าง log แล้ว', 'ok');
        } catch (_error) {
          showToast('ล้าง log ไม่สำเร็จ', 'error');
        }
      });
    }

    if (typeof api.onMclcLogLine === 'function') {
      api.onMclcLogLine((payload) => {
        if (!payload || !payload.line) return;
        if (dom.logModal.classList.contains('hidden')) return;
        dom.logContent.textContent = `${dom.logContent.textContent || ''}${dom.logContent.textContent ? '\n' : ''}${payload.line}`;
        scrollLogToBottom();
      });
    }
  }

  async function init() {
    api = await resolveElectronApi();
    if (!api) {
      setStatus('เชื่อมต่อระบบ Launcher ไม่สำเร็จ กรุณาปิดแล้วเปิดแอปใหม่', 'error');
      showToast('ไม่พบ electronAPI จาก preload', 'error');
      return;
    }

    const savedTheme = window.localStorage.getItem('launcher-theme');
    const initialTheme = savedTheme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = initialTheme;
    if (dom.themeToggleButton) {
      dom.themeToggleButton.innerText = initialTheme === 'dark' ? 'โหมดขาว' : 'โหมดดำ';
    }
    const savedUsername = window.localStorage.getItem(usernameStorageKey);
    if (savedUsername && dom.usernameInput) {
      dom.usernameInput.value = savedUsername;
    }
    setPlayButtonLoading(false);
    resetProgressHidden();
    if (typeof api.subscribeGameState === 'function') {
      api.subscribeGameState();
    }
    bindPlayButton();
    bindInstallJavaButton();
    bindLaunchErrorListener();
    bindLaunchStartedListener();
    bindLaunchProgressListener();
    bindLaunchReadyListener();
    bindModpackUpdateProgressListener();
    bindGameStateListener();
    bindThemeToggle();
    bindLogViewer();
    startGameStatePolling();
    if (typeof api.getGameState === 'function') {
      const state = await api.getGameState();
      applyGameState(state);
    }
    await refreshJavaState();
  }

  return {
    init
  };
}

window.createLauncherPageController = createLauncherPageController;
