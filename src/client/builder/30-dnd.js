// src/client/builder/30-dnd.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  // Singleton placeholder element used during drag and drop
  NS.getPlaceholder = function getPlaceholder(){
    if (!NS._placeholderEl) {
      const el = document.createElement('div');
      el.className = 'dnd-insert';
      NS._placeholderEl = el;
    }
    return NS._placeholderEl;
  };

  NS.placePlaceholder = function placePlaceholder(targetEl, before = true){
    const ph = NS.getPlaceholder();
    if (!targetEl || !targetEl.parentNode) return;
    before ? targetEl.parentNode.insertBefore(ph, targetEl)
           : targetEl.parentNode.insertBefore(ph, targetEl.nextSibling);
  };

  NS.removePlaceholder = function removePlaceholder(){
    const ph = NS.getPlaceholder();
    if (ph.parentNode) ph.parentNode.removeChild(ph);
  };

  // Given the preview container and the index the item was dragged from,
  // compute the logical target index, accounting for the placeholder position
  NS.computeDropTarget = function computeDropTarget(previewEl, fromIndex){
    const kids = Array.from(previewEl.children);
    let rawTo = kids.indexOf(NS.getPlaceholder());
    if (rawTo < 0) rawTo = kids.length;

    let to = rawTo;
    if (fromIndex < rawTo) to = rawTo - 1;

    const isNoop = (to === fromIndex) || (rawTo === fromIndex + 1);
    return { to, isNoop };
  };

  // Immutable move within an array
  NS.move = function move(arr, from, to){
    if (from === to || from < 0 || to < 0 || from >= arr.length || to > arr.length) return arr;
    const copy = arr.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };
})();

