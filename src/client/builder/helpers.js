// src/client/builder/helpers.js

export function parseOptions(str = '') {
    return String(str)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

export function needsOptions(type) {
    return type === 'dropdown' || type === 'multipleChoice' || type === 'checkboxes';
}

export function whenIntlReady(cb, tries = 40) {
    if (window.intlTelInput) return cb();
    if (tries <= 0) return;
    setTimeout(() => whenIntlReady(cb, tries - 1), 50);
}
