function getConsoleMethod(targetConsole, method) {
    if (targetConsole && typeof targetConsole[method] === 'function') {
        return targetConsole[method].bind(targetConsole);
    }

    return () => {};
}

function isRendererDevMode(win = typeof window !== 'undefined' ? window : undefined) {
    if (!win) {
        return false;
    }

    if (win.DEBUG_AUDIO) {
        return true;
    }

    if (win.electronAPI && typeof win.electronAPI.isDevMode === 'boolean') {
        return win.electronAPI.isDevMode;
    }

    return false;
}

function createRendererLogger(targetConsole = console, isDev = false) {
    const original = {
        log: getConsoleMethod(targetConsole, 'log'),
        info: getConsoleMethod(targetConsole, 'info'),
        debug: getConsoleMethod(targetConsole, 'debug'),
        warn: getConsoleMethod(targetConsole, 'warn'),
        error: getConsoleMethod(targetConsole, 'error')
    };

    return {
        isDev,
        log: isDev ? original.log : () => {},
        info: isDev ? original.info : () => {},
        debug: isDev ? original.debug : () => {},
        warn: original.warn,
        error: original.error
    };
}

function installRendererLogger(win = typeof window !== 'undefined' ? window : undefined, targetConsole = console) {
    if (!win || !targetConsole) {
        return createRendererLogger(targetConsole, false);
    }

    if (win.__rendererLoggerInstalled && win.logger) {
        return win.logger;
    }

    const logger = createRendererLogger(targetConsole, isRendererDevMode(win));

    targetConsole.log = logger.log;
    targetConsole.info = logger.info;
    targetConsole.debug = logger.debug;
    targetConsole.warn = logger.warn;
    targetConsole.error = logger.error;

    win.logger = logger;
    win.__rendererLoggerInstalled = true;
    return logger;
}

if (typeof window !== 'undefined' && (typeof module === 'undefined' || !module.exports)) {
    installRendererLogger(window, console);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isRendererDevMode,
        createRendererLogger,
        installRendererLogger
    };
}
