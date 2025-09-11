// src/server/utils/errorHandler.js
// Centralized error handling utilities

import { env } from '../config/env.js';

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.statusCode = 400;
    }
}

export class NotFoundError extends Error {
    constructor(message = 'Resource not found') {
        super(message);
        this.name = 'NotFoundError';
        this.statusCode = 404;
    }
}

export class UnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
        super(message);
        this.name = 'UnauthorizedError';
        this.statusCode = 401;
    }
}

export class ForbiddenError extends Error {
    constructor(message = 'Forbidden') {
        super(message);
        this.name = 'ForbiddenError';
        this.statusCode = 403;
    }
}

export class ConflictError extends Error {
    constructor(message = 'Conflict') {
        super(message);
        this.name = 'ConflictError';
        this.statusCode = 409;
    }
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
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
    // Log error in development
    if (env.NODE_ENV === 'development') {
        console.error('Error:', err);
    }

    // Handle known error types
    if (err instanceof ValidationError) {
        return res.status(err.statusCode).json({
            error: err.message,
            field: err.field,
            type: 'validation_error'
        });
    }

    if (err instanceof NotFoundError) {
        return res.status(err.statusCode).json({
            error: err.message,
            type: 'not_found'
        });
    }

    if (err instanceof UnauthorizedError) {
        return res.status(err.statusCode).json({
            error: err.message,
            type: 'unauthorized'
        });
    }

    if (err instanceof ForbiddenError) {
        return res.status(err.statusCode).json({
            error: err.message,
            type: 'forbidden'
        });
    }

    if (err instanceof ConflictError) {
        return res.status(err.statusCode).json({
            error: err.message,
            type: 'conflict'
        });
    }

    // Handle Sequelize errors
    if (err.name === 'SequelizeValidationError') {
        const errors = err.errors.map(e => `${e.path}: ${e.message}`);
        return res.status(400).json({
            error: 'Validation failed',
            details: errors,
            type: 'validation_error'
        });
    }

    if (err.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
            error: 'Resource already exists',
            type: 'conflict'
        });
    }

    if (err.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({
            error: 'Invalid reference',
            type: 'validation_error'
        });
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Invalid token',
            type: 'unauthorized'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Token expired',
            type: 'unauthorized'
        });
    }

    // Default error response
    const statusCode = err.statusCode || err.status || 500;
    const message = env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error';

    res.status(statusCode).json({
        error: message,
        type: 'internal_error',
        ...(env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'Route not found',
        type: 'not_found',
        path: req.path
    });
}

/**
 * Validation helper
 */
export function validateRequired(value, fieldName) {
    if (value === undefined || value === null || value === '') {
        throw new ValidationError(`${fieldName} is required`, fieldName);
    }
    return value;
}

export function validateType(value, expectedType, fieldName) {
    if (typeof value !== expectedType) {
        throw new ValidationError(`${fieldName} must be a ${expectedType}`, fieldName);
    }
    return value;
}

export function validateArray(value, fieldName) {
    if (!Array.isArray(value)) {
        throw new ValidationError(`${fieldName} must be an array`, fieldName);
    }
    return value;
}
