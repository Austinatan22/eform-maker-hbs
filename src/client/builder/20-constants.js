// src/client/builder/20-constants.js
(function () {
  const NS = (window.BuilderApp = window.BuilderApp || {});

  // Field types that actually have options
  NS.OPTION_TYPES = new Set(['dropdown', 'multipleChoice', 'checkboxes']);

  // Only keep these keys when saving
  NS.CLEAN_KEYS = new Set([
    'id', 'type', 'label', 'options', 'value', 'placeholder', 'name',
    'required', 'doNotStore'
  ]);

  // Map builder types -> partial filenames
  NS.PARTIAL_FOR = {
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
    url: 'url',
    file: 'file',
    richText: 'rich-text'
  };

  // Defaults
  NS.FIELDS_DEFAULTS = {
    label: (t) => ({
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
      date: 'Date',
      time: 'Time',
      url: 'URL',
      file: 'File Upload',
      richText: 'Rich Text Editor'
    }[t] || (t || '')),
    options: (t) => NS.OPTION_TYPES.has(t) ? 'Option 1, Option 2' : '',
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
      datetime: '',
      date: '',
      time: '',
      url: 'https://example.com',
      file: '',
      richText: 'Type something...'
    }[t] || '')
  };
})();
