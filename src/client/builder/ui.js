// src/client/builder/ui.js

// Flash an element by toggling a CSS class briefly
export function flash(el, className = 'drop-flash', ms = 450) {
    if (!el) return;
    try {
        el.classList.add(className);
        setTimeout(() => el.classList.remove(className), ms);
    } catch (_) { }
}

// Bootstrap Tab helpers (safe if BS not loaded)
export function getTab(btn) {
    const Tab = window.bootstrap?.Tab || (window.bootstrap && window.bootstrap.Tab);
    return Tab ? Tab.getOrCreateInstance(btn) : null;
}

export function showTab(btn) {
    if (!btn) return;
    const inst = getTab(btn);
    inst ? inst.show() : btn.click?.();
}

// Quick query helpers
export function qs(sel, root) {
    return (root || document).querySelector(sel);
}

export function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
}
