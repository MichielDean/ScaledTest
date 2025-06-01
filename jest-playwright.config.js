module.exports = {
  browsers: ['chromium'],
  launchOptions: {
    headless: true,
    slowMo: 0,
  },
  contextOptions: {
    ignoreHTTPSErrors: true,
    viewport: {
      width: 1920,
      height: 1080,
    },
  },
};
