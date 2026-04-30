const fs = require('fs');
const path = require('path');

describe('renderer logger bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('suppresses log/info/debug in production while preserving warn/error', () => {
    const originalCalls = {
      log: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const targetConsole = {
      log: originalCalls.log,
      info: originalCalls.info,
      debug: originalCalls.debug,
      warn: originalCalls.warn,
      error: originalCalls.error
    };
    const win = {
      electronAPI: {
        isDevMode: false
      }
    };

    const logger = require('../../src/js/logger');
    const facade = logger.installRendererLogger(win, targetConsole);

    targetConsole.log('hidden log');
    targetConsole.info('hidden info');
    targetConsole.debug('hidden debug');
    targetConsole.warn('visible warn');
    targetConsole.error('visible error');

    expect(facade.isDev).toBe(false);
    expect(originalCalls.log).not.toHaveBeenCalled();
    expect(originalCalls.info).not.toHaveBeenCalled();
    expect(originalCalls.debug).not.toHaveBeenCalled();
    expect(originalCalls.warn).toHaveBeenCalledWith('visible warn');
    expect(originalCalls.error).toHaveBeenCalledWith('visible error');
  });

  test('keeps log/info/debug enabled in development mode', () => {
    const originalCalls = {
      log: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const targetConsole = {
      log: originalCalls.log,
      info: originalCalls.info,
      debug: originalCalls.debug,
      warn: originalCalls.warn,
      error: originalCalls.error
    };
    const win = {
      electronAPI: {
        isDevMode: true
      }
    };

    const logger = require('../../src/js/logger');
    logger.installRendererLogger(win, targetConsole);

    targetConsole.log('dev log');
    targetConsole.info('dev info');
    targetConsole.debug('dev debug');

    expect(originalCalls.log).toHaveBeenCalledWith('dev log');
    expect(originalCalls.info).toHaveBeenCalledWith('dev info');
    expect(originalCalls.debug).toHaveBeenCalledWith('dev debug');
  });

  test('index.html loads logger.js before the rest of the renderer scripts', () => {
    const indexHtmlPath = path.resolve(__dirname, '../../src/index.html');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const loggerIndex = indexHtml.indexOf('<script src="js/logger.js"></script>');
    const i18nIndex = indexHtml.indexOf('<script src="js/i18n.js"></script>');

    expect(loggerIndex).toBeGreaterThanOrEqual(0);
    expect(i18nIndex).toBeGreaterThan(loggerIndex);
  });
});
