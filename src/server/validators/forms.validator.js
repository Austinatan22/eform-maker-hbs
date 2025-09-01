// src/server/validators/forms.validator.js

export const NEEDS_OPTS = new Set(['dropdown', 'multipleChoice', 'checkboxes']);

export const parseOpts = (s = '') => String(s)
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);

export const isNonEmpty = (v) => !!String(v || '').trim();

export function isValidField(f) {
  if (!f) return false;
  if (!isNonEmpty(f.label)) return false;
  if (!isNonEmpty(f.name)) return false;
  if (NEEDS_OPTS.has(f.type)) {
    const hasOptions = parseOpts(f.options).length > 0;
    if (!hasOptions) return false;
  }
  return true;
}

export function sanitizeFields(fields = []) {
  return fields.map(f => {
    const cleaned = { ...f };
    if (NEEDS_OPTS.has(cleaned.type)) {
      if (Array.isArray(cleaned.options)) {
        cleaned.options = cleaned.options.map(x => String(x).trim()).filter(Boolean).join(', ');
      } else {
        cleaned.options = parseOpts(cleaned.options).join(', ');
      }
    } else {
      delete cleaned.options;
    }
    delete cleaned.autoName;
    return cleaned;
  });
}

