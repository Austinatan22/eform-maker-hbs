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
            return [`${prefix} ${message}`, ...args];
        }
        return `${prefix} ${message}`;
    }

    error(message, ...args) {
        if (this._shouldLog('error')) {
            const formatted = this._formatMessage('error', message, ...args);
            if (Array.isArray(formatted)) {
                console.error(...formatted);
            } else {
                console.error(formatted);
            }
        }
    }

    warn(message, ...args) {
        if (this._shouldLog('warn')) {
            const formatted = this._formatMessage('warn', message, ...args);
            if (Array.isArray(formatted)) {
                console.warn(...formatted);
            } else {
                console.warn(formatted);
            }
        }
    }

    info(message, ...args) {
        if (this._shouldLog('info')) {
            const formatted = this._formatMessage('info', message, ...args);
            if (Array.isArray(formatted)) {
                console.info(...formatted);
            } else {
                console.info(formatted);
            }
        }
    }

    debug(message, ...args) {
        if (this._shouldLog('debug')) {
            const formatted = this._formatMessage('debug', message, ...args);
            if (Array.isArray(formatted)) {
                console.debug(...formatted);
            } else {
                console.debug(formatted);
            }
        }
    }

    // For backward compatibility
    log(message, ...args) {
        this.info(message, ...args);
    }
}

export const logger = new Logger();
export default logger;
