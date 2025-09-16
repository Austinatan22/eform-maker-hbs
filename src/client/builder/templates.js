// src/client/builder/templates.js

// Compiled Handlebars partials keyed by partial name
export const TEMPLATES = Object.create(null);

// Preload and compile field partial templates once
export async function preloadTemplates(partialForMap) {
    const names = [...new Set(Object.values(partialForMap))];
    const fetches = names.map(async (n) => {
        const res = await fetch(`/tpl/fields/${n}.hbs`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Load template failed: ${n}`);
        const src = await res.text();
        TEMPLATES[n] = Handlebars.compile(src);
    });
    await Promise.all(fetches);
}

// Render one field to HTML using a precompiled partial
export function renderFieldHTML(field, idx, partialForMap) {
    const partialName = (partialForMap && partialForMap[field.type]) || 'text';
    const tmpl = TEMPLATES[partialName];
    if (!tmpl) return '';
    const options = String(field.options || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    return tmpl({
        name: field.name || field.id || `f_${idx}`,
        label: field.label || '',
        required: !!field.required,
        placeholder: field.placeholder || '',
        options
    });
}
