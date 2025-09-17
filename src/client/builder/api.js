// src/client/builder/api.js

function toQuery(params) {
    const u = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        u.append(k, String(v));
    });
    return u.toString();
}

async function fetchJson(url, opts) {
    const token = (window.CSRF_TOKEN || document.querySelector('meta[name="csrf-token"]')?.content || '');
    const headers = Object.assign({}, (opts && opts.headers) || {});
    if (token && !headers['CSRF-Token']) headers['CSRF-Token'] = token;
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json() : await res.text();
    return { res, body };
}

export const API = {
    async checkTitleUnique(title, excludeId) {
        const qs = toQuery({ title, excludeId });
        return fetchJson(`/api/forms/check-title?${qs}`, { cache: 'no-store' });
    },
    async saveForm(payload) {
        return fetchJson('/api/forms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },
    async getForm(id) {
        return fetchJson(`/api/forms/${encodeURIComponent(id)}`, { cache: 'no-store' });
    },
    async deleteForm(id) {
        return fetchJson(`/api/forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    // Template API methods
    async checkTemplateNameUnique(name, excludeId) {
        const qs = toQuery({ name, excludeId });
        return fetchJson(`/api/templates/check-name?${qs}`, { cache: 'no-store' });
    },
    async saveTemplate(payload) {
        return fetchJson('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },
    async getTemplate(id) {
        return fetchJson(`/api/templates/${encodeURIComponent(id)}`, { cache: 'no-store' });
    },
    async deleteTemplate(id) {
        return fetchJson(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
};
