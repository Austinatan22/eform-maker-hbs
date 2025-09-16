// src/client/builder/state.js

export const LS_KEY = 'eform-maker-hbs';

function safeParse(json, fallback) {
    try {
        return JSON.parse(json);
    } catch {
        return fallback;
    }
}

export function readLocal(formId) {
    try {
        const key = formId ? `${LS_KEY}-${formId}` : LS_KEY;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return safeParse(raw, null);
    } catch {
        return null;
    }
}

export function writeLocal(data, formId) {
    try {
        const key = formId ? `${LS_KEY}-${formId}` : LS_KEY;
        localStorage.setItem(key, JSON.stringify(data || {}));
        return true;
    } catch {
        return false;
    }
}

export function clearLocal(formId) {
    try {
        const key = formId ? `${LS_KEY}-${formId}` : LS_KEY;
        localStorage.removeItem(key);
    } catch { }
}
