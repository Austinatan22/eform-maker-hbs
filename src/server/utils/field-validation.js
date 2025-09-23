// src/server/utils/field-validation.js
import { formFieldValidation, sanitize } from '../services/validation.service.js';

/**
 * Shared field validation utilities to eliminate code duplication
 */

export function sanitizeFields(fields = []) {
    if (!Array.isArray(fields)) {
        throw new Error('Fields must be an array');
    }
    return fields.map(field => {
        const cleaned = { ...field };

        // Sanitize text fields
        if (cleaned.label) cleaned.label = sanitize.html(cleaned.label);
        if (cleaned.placeholder) cleaned.placeholder = sanitize.html(cleaned.placeholder);
        if (cleaned.name) {
            cleaned.name = sanitize.database(cleaned.name);
            // Ensure field name starts with a letter (fallback for client-side issues)
            if (cleaned.name && !/^[a-zA-Z]/.test(cleaned.name)) {
                cleaned.name = 'field_' + cleaned.name;
            }
        }

        // Handle options for dropdown/radio/checkbox fields
        const needsOptions = ['dropdown', 'multipleChoice', 'checkboxes'];
        if (needsOptions.includes(cleaned.type)) {
            if (Array.isArray(cleaned.options)) {
                cleaned.options = cleaned.options.map(opt => sanitize.html(String(opt))).join(', ');
            } else {
                cleaned.options = String(cleaned.options || '').split(',')
                    .map(opt => sanitize.html(opt.trim()))
                    .filter(Boolean)
                    .join(', ');
            }
        } else {
            delete cleaned.options;
        }

        // Remove auto-generated fields
        delete cleaned.autoName;

        return cleaned;
    });
}

export function isValidField(field) {
    if (!field) return false;

    // Check required fields
    const labelError = formFieldValidation.label(field.label);
    if (labelError) return false;

    const nameError = formFieldValidation.name(field.name);
    if (nameError) return false;

    const typeError = formFieldValidation.type(field.type);
    if (typeError) return false;

    // Check options for fields that need them
    const optionsError = formFieldValidation.options(field.options, field.type);
    if (optionsError) return false;

    return true;
}

export function validateFields(fields) {
    const clean = sanitizeFields(fields);
    const fieldErrors = [];

    for (let i = 0; i < clean.length; i++) {
        const field = clean[i];

        // Validate each field property
        const labelError = formFieldValidation.label(field.label);
        if (labelError) fieldErrors.push(`Field ${i + 1}: ${labelError}`);

        const nameError = formFieldValidation.name(field.name);
        if (nameError) fieldErrors.push(`Field ${i + 1}: ${nameError}`);

        const typeError = formFieldValidation.type(field.type);
        if (typeError) fieldErrors.push(`Field ${i + 1}: ${typeError}`);

        const placeholderError = formFieldValidation.placeholder(field.placeholder);
        if (placeholderError) fieldErrors.push(`Field ${i + 1}: ${placeholderError}`);

        const optionsError = formFieldValidation.options(field.options, field.type);
        if (optionsError) fieldErrors.push(`Field ${i + 1}: ${optionsError}`);

        if (!isValidField(field)) {
            fieldErrors.push(`Field ${i + 1}: Invalid field definition`);
        }
    }

    return { clean, fieldErrors };
}

export function ensureUniqueFieldNames(fields) {
    const seen = new Set();
    for (const f of fields) {
        const key = String(f.name || '');
        if (seen.has(key)) {
            throw new Error('Field names must be unique within a form.');
        }
        seen.add(key);
    }
}
