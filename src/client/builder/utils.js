// src/client/builder/utils.js
export function uuid() {
    const ALPH = '0123456789abcdefghijklmnopqrstuvwxyz';
    const n = 8; // random part length
    const buf = new Uint8Array(n);
    if (window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(buf);
    } else {
        for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    let rand = '';
    for (let i = 0; i < n; i++) rand += ALPH[buf[i] % 36];
    return 'field_' + rand;
}

export function debounce(fn, ms = 160) {
    let t;
    return function (...a) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, a), ms);
    };
}

export function toSafeSnake(s) {
    let result = String(s || '')
        .trim()
        .replace(/[\s\-]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();

    // Ensure the result starts with a letter (required by server validation)
    if (result && /^[0-9_]/.test(result)) {
        result = 'field_' + result;
    }

    // If result is empty or only underscores, use a default
    if (!result || result === '_') {
        result = 'field';
    }

    return result;
}

export function toSafeUpperSnake(s) {
    return toSafeSnake(s).toUpperCase();
}

/**
 * Generate a unique field name based on existing field names
 * @param {string} baseName - The base name to use
 * @param {Set|Array} existingNames - Set or array of existing field names
 * @returns {string} - Unique field name
 */
export function generateUniqueFieldName(baseName, existingNames) {
    const existing = new Set(existingNames);
    const base = toSafeSnake(baseName) || 'field';
    let name = base;

    if (!existing.has(name)) {
        existing.add(name);
        return name;
    }

    let i = 1;
    let candidate = `${base}${i}`;
    while (existing.has(candidate)) {
        i++;
        candidate = `${base}${i}`;
    }
    existing.add(candidate);
    return candidate;
}