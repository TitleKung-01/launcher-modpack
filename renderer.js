function createToastApi(host) {
  return (message, tone = 'warn') => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = tone;
    toast.innerText = message;
    host.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    }, 2800);

    setTimeout(() => {
      toast.remove();
    }, 3150);
  };
}

const controller = window.createLauncherPageController({
  electronAPI: window.electronAPI,
  dom: {
    playButton: document.getElementById('play-btn'),
    updateModpackButton: document.getElementById('update-modpack-btn'),
    installJavaButton: document.getElementById('install-java-btn'),
    usernameInput: document.getElementById('username'),
    statusText: document.getElementById('status-text'),
    themeToggleButton: document.getElementById('theme-toggle-btn'),
    progressGroup: document.getElementById('launch-progress-group'),
    progressFill: document.getElementById('launch-progress-fill'),
    progressText: document.getElementById('launch-progress-text'),
    viewLogButton: document.getElementById('view-log-btn'),
    logModal: document.getElementById('log-modal'),
    logModalBackdrop: document.querySelector('#log-modal [data-modal-close="true"]'),
    logCloseButton: document.getElementById('log-close-btn'),
    logRefreshButton: document.getElementById('log-refresh-btn'),
    logCopyButton: document.getElementById('log-copy-btn'),
    logClearButton: document.getElementById('log-clear-btn'),
    logContent: document.getElementById('log-content')
  },
  alertApi: createToastApi(document.getElementById('toast-host'))
});

controller.init();