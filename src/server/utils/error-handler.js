// src/server/utils/error-handler.js
import { logger } from './logger.js';

/**
 * Standardized error response helper
 */
export function handleError(res, error, context = 'Unknown operation') {
    logger.error(`${context} failed:`, error);

    const isDevelopment = process.env.NODE_ENV !== 'production';

    // Determine status code based on error type
    let statusCode = 500;
    let message = 'An internal server error occurred';

    if (error.name === 'ValidationError') {
        statusCode = 400;
        message = error.message;
    } else if (error.name === 'SequelizeValidationError') {
        statusCode = 400;
        message = 'Validation failed';
    } else if (error.name === 'SequelizeUniqueConstraintError') {
        statusCode = 409;
        message = 'Resource already exists';
    } else if (error.name === 'SequelizeForeignKeyConstraintError') {
        statusCode = 400;
        message = 'Invalid reference to related resource';
    } else if (error.name === 'SequelizeDatabaseError') {
        statusCode = 500;
        message = 'Database error occurred';
    } else if (error.status || error.statusCode) {
        statusCode = error.status || error.statusCode;
        message = error.message || message;
    }

    const response = {
        error: message,
        ...(isDevelopment && {
            details: error.message,
            stack: error.stack
        })
    };

    res.status(statusCode).json(response);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Validation error helper
 */
export function validationError(message, details = {}) {
    const error = new Error(message);
    error.name = 'ValidationError';
    error.details = details;
    error.status = 400;
    return error;
}

/**
 * Not found error helper
 */
export function notFoundError(resource = 'Resource') {
    const error = new Error(`${resource} not found`);
    error.name = 'NotFoundError';
    error.status = 404;
    return error;
}

/**
 * Unauthorized error helper
 */
export function unauthorizedError(message = 'Unauthorized access') {
    const error = new Error(message);
    error.name = 'UnauthorizedError';
    error.status = 401;
    return error;
}

/**
 * Forbidden error helper
 */
export function forbiddenError(message = 'Access forbidden') {
    const error = new Error(message);
    error.name = 'ForbiddenError';
    error.status = 403;
    return error;
}
