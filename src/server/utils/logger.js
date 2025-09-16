// src/server/utils/logger.js
// Simple logging utility to replace console statements

const isDevelopment = process.env.NODE_ENV !== 'production';

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
    }

    _shouldLog(level) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        return levels[level] <= levels[this.logLevel];
    }

    _formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

        if (args.length > 0) {
            return `${prefix} ${message}`, ...args;
        }
        return `${prefix} ${message}`;
    }

    error(message, ...args) {
        if (this._shouldLog('error')) {
            console.error(this._formatMessage('error', message, ...args));
        }
    }

    warn(message, ...args) {
        if (this._shouldLog('warn')) {
            console.warn(this._formatMessage('warn', message, ...args));
        }
    }

    info(message, ...args) {
        if (this._shouldLog('info')) {
            console.info(this._formatMessage('info', message, ...args));
        }
    }

    debug(message, ...args) {
        if (this._shouldLog('debug')) {
            console.debug(this._formatMessage('debug', message, ...args));
        }
    }

    // For backward compatibility
    log(message, ...args) {
        this.info(message, ...args);
    }
}

export const logger = new Logger();
export default logger;
