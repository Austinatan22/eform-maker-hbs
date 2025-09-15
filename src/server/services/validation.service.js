// src/server/services/validation.service.js
import validator from 'validator';

/**
 * Enhanced input validation service
 */

// Sanitization functions
export const sanitize = {
    // Remove HTML tags and dangerous characters
    html: (input) => {
        if (typeof input !== 'string') return input;
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]*>/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    },

    // Sanitize for database storage
    database: (input) => {
        if (typeof input !== 'string') return input;
        return input
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
            .trim();
    },

    // Sanitize email
    email: (input) => {
        if (typeof input !== 'string') return '';
        return validator.normalizeEmail(input.trim().toLowerCase()) || '';
    },

    // Sanitize URL
    url: (input) => {
        if (typeof input !== 'string') return '';
        const trimmed = input.trim();
        if (!trimmed) return '';

        // Add protocol if missing
        if (!/^https?:\/\//i.test(trimmed)) {
            return `https://${trimmed}`;
        }
        return trimmed;
    },

    // Sanitize phone number
    phone: (input) => {
        if (typeof input !== 'string') return '';
        return input.replace(/[^\d+\-\(\)\s]/g, '').trim();
    }
};

// Validation functions
export const validate = {
    // Required field validation
    required: (value, fieldName = 'Field') => {
        if (value === null || value === undefined || value === '') {
            return `${fieldName} is required`;
        }
        if (typeof value === 'string' && !value.trim()) {
            return `${fieldName} cannot be empty`;
        }
        return null;
    },

    // String length validation
    length: (value, min = 0, max = Infinity, fieldName = 'Field') => {
        if (typeof value !== 'string') {
            return `${fieldName} must be a string`;
        }
        const len = value.length;
        if (len < min) {
            return `${fieldName} must be at least ${min} characters long`;
        }
        if (len > max) {
            return `${fieldName} must be no more than ${max} characters long`;
        }
        return null;
    },

    // Email validation
    email: (value, fieldName = 'Email') => {
        if (!value) return null; // Allow empty if not required
        if (typeof value !== 'string') {
            return `${fieldName} must be a string`;
        }
        if (!validator.isEmail(value)) {
            return `${fieldName} must be a valid email address`;
        }
        return null;
    },

    // URL validation
    url: (value, fieldName = 'URL') => {
        if (!value) return null; // Allow empty if not required
        if (typeof value !== 'string') {
            return `${fieldName} must be a string`;
        }
        if (!validator.isURL(value, { protocols: ['http', 'https'], require_protocol: true })) {
            return `${fieldName} must be a valid URL`;
        }
        return null;
    },

    // Phone number validation (basic)
    phone: (value, fieldName = 'Phone') => {
        if (!value) return null; // Allow empty if not required
        if (typeof value !== 'string') {
            return `${fieldName} must be a string`;
        }
        // Remove all non-digit characters for validation
        const digits = value.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) {
            return `${fieldName} must be a valid phone number`;
        }
        return null;
    },

    // Numeric validation
    number: (value, min = -Infinity, max = Infinity, fieldName = 'Number') => {
        if (value === null || value === undefined || value === '') {
            return null; // Allow empty if not required
        }
        const num = Number(value);
        if (isNaN(num)) {
            return `${fieldName} must be a valid number`;
        }
        if (num < min) {
            return `${fieldName} must be at least ${min}`;
        }
        if (num > max) {
            return `${fieldName} must be no more than ${max}`;
        }
        return null;
    },

    // Date validation
    date: (value, fieldName = 'Date') => {
        if (!value) return null; // Allow empty if not required
        const date = new Date(value);
        if (isNaN(date.getTime())) {
            return `${fieldName} must be a valid date`;
        }
        return null;
    },

    // File validation
    file: (file, allowedTypes = [], maxSize = 10 * 1024 * 1024, fieldName = 'File') => {
        if (!file) return null; // Allow empty if not required

        if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
            return `${fieldName} type not allowed. Allowed types: ${allowedTypes.join(', ')}`;
        }

        if (file.size > maxSize) {
            const maxSizeMB = Math.round(maxSize / (1024 * 1024));
            return `${fieldName} too large. Maximum size is ${maxSizeMB}MB`;
        }

        return null;
    },

    // Array validation
    array: (value, minLength = 0, maxLength = Infinity, fieldName = 'Array') => {
        if (!Array.isArray(value)) {
            return `${fieldName} must be an array`;
        }
        if (value.length < minLength) {
            return `${fieldName} must have at least ${minLength} items`;
        }
        if (value.length > maxLength) {
            return `${fieldName} must have no more than ${maxLength} items`;
        }
        return null;
    },

    // Regex validation
    pattern: (value, pattern, fieldName = 'Field', message = 'Invalid format') => {
        if (!value) return null; // Allow empty if not required
        if (typeof value !== 'string') {
            return `${fieldName} must be a string`;
        }
        if (!pattern.test(value)) {
            return `${fieldName} ${message}`;
        }
        return null;
    }
};

// Form field validation rules
export const formFieldValidation = {
    label: (value) => {
        const required = validate.required(value, 'Field label');
        if (required) return required;
        return validate.length(value, 1, 255, 'Field label');
    },

    name: (value) => {
        const required = validate.required(value, 'Field name');
        if (required) return required;
        const length = validate.length(value, 1, 64, 'Field name');
        if (length) return length;
        return validate.pattern(value, /^[a-zA-Z][a-zA-Z0-9_]*$/, 'Field name', 'must start with a letter and contain only letters, numbers, and underscores');
    },

    placeholder: (value) => {
        if (!value) return null;
        return validate.length(value, 0, 255, 'Placeholder');
    },

    options: (value, fieldType) => {
        // Only validate options for fields that need them
        const needsOptions = ['dropdown', 'radio', 'checkbox'];
        if (!needsOptions.includes(fieldType)) return null;

        if (!value || !value.trim()) {
            return 'Options are required for this field type';
        }

        const options = value.split(',').map(opt => opt.trim()).filter(opt => opt);
        if (options.length === 0) {
            return 'At least one option is required';
        }

        if (options.length > 50) {
            return 'Maximum 50 options allowed';
        }

        // Check for duplicate options
        const uniqueOptions = new Set(options);
        if (uniqueOptions.size !== options.length) {
            return 'Duplicate options are not allowed';
        }

        return null;
    }
};

// User input validation rules
export const userValidation = {
    email: (value) => {
        const required = validate.required(value, 'Email');
        if (required) return required;
        const sanitized = sanitize.email(value);
        return validate.email(sanitized, 'Email');
    },

    username: (value) => {
        if (!value) return null; // Username is optional
        const length = validate.length(value, 3, 64, 'Username');
        if (length) return length;
        return validate.pattern(value, /^[a-zA-Z0-9._-]+$/, 'Username', 'can only contain letters, numbers, dots, hyphens, and underscores');
    },

    role: (value) => {
        const required = validate.required(value, 'Role');
        if (required) return required;
        const validRoles = ['admin', 'editor', 'viewer'];
        if (!validRoles.includes(value)) {
            return 'Role must be one of: ' + validRoles.join(', ');
        }
        return null;
    }
};

// Form validation rules
export const formValidation = {
    title: (value) => {
        const required = validate.required(value, 'Form title');
        if (required) return required;
        return validate.length(value, 1, 255, 'Form title');
    },

    category: (value) => {
        const required = validate.required(value, 'Form category');
        if (required) return required;
        const validCategories = ['survey', 'quiz', 'feedback'];
        if (!validCategories.includes(value)) {
            return 'Category must be one of: ' + validCategories.join(', ');
        }
        return null;
    },

    fields: (value) => {
        const required = validate.required(value, 'Form fields');
        if (required) return required;
        return validate.array(value, 1, 100, 'Form fields');
    }
};

// Generic validation runner
export function runValidation(data, rules) {
    const errors = {};

    for (const [field, rule] of Object.entries(rules)) {
        const value = data[field];
        const error = rule(value);
        if (error) {
            errors[field] = error;
        }
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors
    };
}
