// src/client/builder/constants.js

// Field types that actually have options
export const OPTION_TYPES = new Set(['dropdown', 'multipleChoice', 'checkboxes', 'multipleSelect']);

// Only keep these keys when saving
export const CLEAN_KEYS = new Set([
    'id', 'type', 'label', 'options', 'value', 'placeholder', 'name',
    'required', 'doNotStore'
]);

// Map builder types -> partial filenames
export const PARTIAL_FOR = {
    singleLine: 'text',
    paragraph: 'textarea',
    dropdown: 'select',
    multipleSelect: 'multiple-select',
    multipleChoice: 'radios',
    checkboxes: 'checkboxes',
    number: 'number',
    name: 'name',
    email: 'email',
    phone: 'phone',
    password: 'password',
    date: 'date',
    time: 'time',
    datetime: 'datetime',
    datePicker: 'date-picker',
    timePicker: 'time-picker',
    datetimePicker: 'datetime-picker',
    rangePicker: 'range-picker',
    colorPicker: 'color-picker',
    url: 'url',
    file: 'file',
    richText: 'rich-text'
};

// Defaults
export const FIELDS_DEFAULTS = {
    label: (t) => ({
        singleLine: 'Single Line Text',
        paragraph: 'Paragraph Text',
        dropdown: 'Dropdown',
        multipleSelect: 'Multiple Select',
        multipleChoice: 'Multiple Choice',
        checkboxes: 'Checkboxes',
        number: 'Number',
        name: 'Full Name',
        email: 'Email',
        phone: 'Phone Number',
        password: 'Password',
        datetime: 'Datetime',
        date: 'Date',
        time: 'Time',
        datePicker: 'Date',
        timePicker: 'Time',
        datetimePicker: 'Datetime',
        rangePicker: 'Date Range',
        colorPicker: 'Color',
        url: 'URL',
        file: 'Multiple File Upload',
        richText: 'Rich Text Editor'
    }[t] || (t || '')),
    options: (t) => OPTION_TYPES.has(t) ? 'Option 1, Option 2' : '',
    placeholder: (t) => ({
        singleLine: 'Enter text…',
        paragraph: 'Type your message…',
        dropdown: 'Select…',
        multipleChoice: '',
        checkboxes: '',
        number: '0',
        name: '',
        email: 'email@example.com',
        phone: 'Phone number',
        password: 'Enter password',
        datetime: '',
        date: 'YYYY-MM-DD',
        time: 'HH:MM',
        datePicker: 'YYYY-MM-DD',
        timePicker: 'HH:MM',
        datetimePicker: 'YYYY-MM-DD HH:MM',
        rangePicker: 'YYYY-MM-DD to YYYY-MM-DD',
        colorPicker: '#000000',
        url: 'https://example.com',
        file: '',
        richText: 'Type something...'
    }[t] || '')
};
