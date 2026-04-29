try {
  const { exposeElectronApi } = require('./src/preload/exposeElectronApi');
  exposeElectronApi();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('[preload] exposeElectronApi failed:', error);
}