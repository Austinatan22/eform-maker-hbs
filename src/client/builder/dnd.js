// src/client/builder/dnd.js

// Singleton placeholder element used during drag and drop
let _placeholderEl = null;

export function getPlaceholder() {
    if (!_placeholderEl) {
        const el = document.createElement('div');
        el.className = 'dnd-insert';
        _placeholderEl = el;
    }
    return _placeholderEl;
}

export function placePlaceholder(targetEl, before = true) {
    const ph = getPlaceholder();
    if (!targetEl || !targetEl.parentNode) return;
    before ? targetEl.parentNode.insertBefore(ph, targetEl)
        : targetEl.parentNode.insertBefore(ph, targetEl.nextSibling);
}

// Compute insertion index based on pointer Y relative to children midlines
export function computeIndexByY(previewEl, clientY) {
    if (!previewEl) return 0;
    const kids = Array.from(previewEl.children).filter(el => el !== getPlaceholder());
    for (let i = 0; i < kids.length; i++) {
        const rect = kids[i].getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (clientY < mid) return i;
    }
    return kids.length; // append at end
}

// Place placeholder at a given child index within preview
export function placePlaceholderAtIndex(previewEl, index) {
    const ph = getPlaceholder();
    if (!previewEl) return;
    const kids = Array.from(previewEl.children).filter(el => el !== ph);
    if (index <= 0) {
        if (kids[0]) previewEl.insertBefore(ph, kids[0]);
        else previewEl.appendChild(ph);
        return;
    }
    if (index >= kids.length) {
        previewEl.appendChild(ph);
        return;
    }
    previewEl.insertBefore(ph, kids[index]);
}

export function removePlaceholder() {
    const ph = getPlaceholder();
    if (ph.parentNode) ph.parentNode.removeChild(ph);
}

// Given the preview container and the index the item was dragged from,
// compute the logical target index, accounting for the placeholder position
export function computeDropTarget(previewEl, fromIndex) {
    const kids = Array.from(previewEl.children);
    let rawTo = kids.indexOf(getPlaceholder());
    if (rawTo < 0) rawTo = kids.length;

    let to = rawTo;
    if (fromIndex < rawTo) to = rawTo - 1;

    const isNoop = (to === fromIndex) || (rawTo === fromIndex + 1);
    return { to, isNoop };
}

// Immutable move within an array
export function move(arr, from, to) {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to > arr.length) return arr;
    const copy = arr.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
}
