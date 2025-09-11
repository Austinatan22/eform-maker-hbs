// src/server/utils/validation.js
// Shared validation utilities

import { OPTION_TYPES, FIELD_VALIDATION } from '../../shared/constants.js';

/**
 * Validates a single field
 */
export function validateField(field) {
    const errors = [];

    if (!field) {
        errors.push('Field is required');
        return errors;
    }

    // Check required fields
    if (!field.label || !String(field.label).trim()) {
        errors.push('Field label is required');
    }

    if (!field.name || !String(field.name).trim()) {
        errors.push('Field name is required');
    }

    // Check field lengths
    if (field.label && String(field.label).length > FIELD_VALIDATION.MAX_LABEL_LENGTH) {
        errors.push(`Field label must be ${FIELD_VALIDATION.MAX_LABEL_LENGTH} characters or less`);
    }

    if (field.name && String(field.name).length > FIELD_VALIDATION.MAX_NAME_LENGTH) {
        errors.push(`Field name must be ${FIELD_VALIDATION.MAX_NAME_LENGTH} characters or less`);
    }

    if (field.placeholder && String(field.placeholder).length > FIELD_VALIDATION.MAX_PLACEHOLDER_LENGTH) {
        errors.push(`Field placeholder must be ${FIELD_VALIDATION.MAX_PLACEHOLDER_LENGTH} characters or less`);
    }

    // Check options for option-based fields
    if (OPTION_TYPES.has(field.type)) {
        if (!field.options || !String(field.options).trim()) {
            errors.push('Options are required for this field type');
        } else if (String(field.options).length > FIELD_VALIDATION.MAX_OPTIONS_LENGTH) {
            errors.push(`Options must be ${FIELD_VALIDATION.MAX_OPTIONS_LENGTH} characters or less`);
        }
    }

    return errors;
}

/**
 * Validates an array of fields
 */
export function validateFields(fields) {
    const errors = [];

    if (!Array.isArray(fields)) {
        errors.push('Fields must be an array');
        return errors;
    }

    // Check for duplicate field names
    const fieldNames = new Set();
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const fieldErrors = validateField(field);

        if (fieldErrors.length > 0) {
            errors.push(`Field ${i + 1}: ${fieldErrors.join(', ')}`);
        }

        // Check for duplicate names
        if (field && field.name) {
            const name = String(field.name).trim();
            if (fieldNames.has(name)) {
                errors.push(`Duplicate field name: "${name}"`);
            }
            fieldNames.add(name);
        }
    }

    return errors;
}

/**
 * Validates form title
 */
export function validateFormTitle(title) {
    const errors = [];

    if (!title || !String(title).trim()) {
        errors.push('Form title is required');
    } else if (String(title).length > 255) {
        errors.push('Form title must be 255 characters or less');
    }

    return errors;
}

/**
 * Validates form category
 */
export function validateFormCategory(category) {
    const errors = [];

    if (category && !['survey', 'quiz', 'feedback'].includes(String(category).toLowerCase())) {
        errors.push('Invalid form category');
    }

    return errors;
}

/**
 * Sanitizes field data
 */
export function sanitizeField(field) {
    if (!field) return null;

    const sanitized = { ...field };

    // Sanitize string fields
    if (sanitized.label) sanitized.label = String(sanitized.label).trim();
    if (sanitized.name) sanitized.name = String(sanitized.name).trim();
    if (sanitized.placeholder) sanitized.placeholder = String(sanitized.placeholder).trim();

    // Sanitize options for option-based fields
    if (OPTION_TYPES.has(sanitized.type)) {
        if (Array.isArray(sanitized.options)) {
            sanitized.options = sanitized.options
                .map(opt => String(opt).trim())
                .filter(Boolean)
                .join(', ');
        } else {
            sanitized.options = String(sanitized.options || '').trim();
        }
    } else {
        delete sanitized.options;
    }

    // Remove auto-generated fields
    delete sanitized.autoName;

    return sanitized;
}

/**
 * Sanitizes an array of fields
 */
export function sanitizeFields(fields) {
    if (!Array.isArray(fields)) return [];

    return fields.map(sanitizeField).filter(Boolean);
}
