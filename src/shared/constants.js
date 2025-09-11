// src/shared/constants.js
// Shared constants between client and server

// Field types that actually have options
export const OPTION_TYPES = new Set(['dropdown', 'multipleChoice', 'checkboxes']);

// Map builder types -> partial filenames
export const PARTIAL_FOR = {
    singleLine: 'text',
    paragraph: 'textarea',
    dropdown: 'select',
    multipleChoice: 'radios',
    checkboxes: 'checkboxes',
    number: 'number',
    name: 'name',
    email: 'email',
    phone: 'phone',
    date: 'date',
    time: 'time',
    datetime: 'datetime',
    month: 'month',
    week: 'week',
    color: 'color',
    url: 'url',
    file: 'file'
};

// Form categories
export const FORM_CATEGORIES = new Set(['survey', 'quiz', 'feedback']);

// User roles
export const USER_ROLES = {
    ADMIN: 'admin',
    EDITOR: 'editor',
    VIEWER: 'viewer'
};

// Field validation rules
export const FIELD_VALIDATION = {
    MAX_LABEL_LENGTH: 255,
    MAX_NAME_LENGTH: 128,
    MAX_PLACEHOLDER_LENGTH: 255,
    MAX_OPTIONS_LENGTH: 1000
};

// API response status codes
export const API_STATUS = {
    SUCCESS: 'success',
    ERROR: 'error',
    VALIDATION_ERROR: 'validation_error'
};

// Default field configurations
export const FIELD_DEFAULTS = {
    label: (type) => ({
        singleLine: 'Single Line Text',
        paragraph: 'Paragraph Text',
        dropdown: 'Dropdown',
        multipleChoice: 'Multiple Choice',
        checkboxes: 'Checkboxes',
        number: 'Number',
        name: 'Full Name',
        email: 'Email',
        phone: 'Phone Number',
        datetime: 'Datetime',
        month: 'Month',
        week: 'Week',
        color: 'Color',
        date: 'Date',
        time: 'Time',
        url: 'URL',
        file: 'File Upload'
    }[type] || (type || '')),

    options: (type) => OPTION_TYPES.has(type) ? 'Option 1, Option 2' : '',

    placeholder: (type) => ({
        singleLine: 'Enter text…',
        paragraph: 'Type your message…',
        dropdown: 'Select…',
        multipleChoice: '',
        checkboxes: '',
        number: '0',
        name: '',
        email: 'email@example.com',
        phone: 'Phone number',
        datetime: '',
        month: '',
        week: '',
        color: '#000000',
        date: '',
        time: '',
        url: 'https://example.com',
        file: ''
    }[type] || '')
};
