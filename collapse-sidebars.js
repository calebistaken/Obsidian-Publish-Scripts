// ===============================================
// Obsidian Publish — Move Right Sidebar into Left
// under the search when viewport <= 1000px
// ===============================================
(() => {
  const BREAKPOINT_PX = 1000;

  // --- Tunables / Fallback selectors --------------------------
  const RIGHT_INNER_SEL = '.site-body-right-column-inner, .right-column .site-body-right-column-inner';
  const LEFT_INNER_SEL  = '.site-body-left-column-inner, .left-column .site-body-left-column-inner, .site-body-left-column';
  const SEARCH_ANCHOR_CANDIDATES = [
    '.search',
    '.page-search',
    '.site-search',
    '.graph-controls .search',
    '.left-sidebar .search'
  ];

  // --- Internal state -----------------------------------------
  let hasCollapsed = false;
  let rightInner = null;
  let leftInner  = null;
  let anchorEl   = null;

  const rightPlaceholder = document.createComment('RIGHT_COLUMN_ORIGINAL_SLOT');
  let transplantedWrapper = null;

  function qsaFirst(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function debounce(fn, wait = 120) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function ensureTargets() {
    if (!rightInner) rightInner = document.querySelector(RIGHT_INNER_SEL);
    if (!leftInner)  leftInner  = document.querySelector(LEFT_INNER_SEL);
    if (!anchorEl)   anchorEl   = qsaFirst(SEARCH_ANCHOR_CANDIDATES, leftInner || document);

    if (!leftInner) {
      leftInner = qsaFirst(['.site-body-left-column', '.left-column', '.site-body-left-column-inner', 'nav.site-nav, .site-nav']);
    }

    if (rightInner && !rightPlaceholder.parentNode) {
      rightInner.parentNode.insertBefore(rightPlaceholder, rightInner);
    }

    return rightInner && leftInner;
  }

  function collapseIntoLeft() {
    if (hasCollapsed) return;
    if (!ensureTargets()) return;

    if (!transplantedWrapper) {
      transplantedWrapper = document.createElement('div');
      transplantedWrapper.className = 'moved-right-sidebar-wrapper';
      transplantedWrapper.setAttribute('data-origin', 'right-sidebar');
      transplantedWrapper.style.width = '100%';
    }

    const toMove = Array.from(rightInner.childNodes);
    if (toMove.length === 0) return;

    toMove.forEach(node => transplantedWrapper.appendChild(node));

    if (anchorEl && anchorEl.parentNode) {
      anchorEl.parentNode.insertBefore(transplantedWrapper, anchorEl.nextSibling);
    } else {
      leftInner.insertBefore(transplantedWrapper, leftInner.firstChild);
    }

    hasCollapsed = true;
    document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
  }

  function restoreToRight() {
    if (!hasCollapsed) return;
    if (!ensureTargets()) return;

    if (transplantedWrapper && transplantedWrapper.childNodes.length) {
      const toReturn = Array.from(transplantedWrapper.childNodes);
      toReturn.forEach(node => rightInner.appendChild(node));
    }

    if (transplantedWrapper && transplantedWrapper.parentNode) {
      transplantedWrapper.parentNode.removeChild(transplantedWrapper);
    }

    hasCollapsed = false;
    document.documentElement.removeAttribute('data-sidebar-collapsed');
  }

  function onResizeOrInit() {
    const shouldCollapse = window.innerWidth <= BREAKPOINT_PX; // collapse at 1000 and below
    if (shouldCollapse) collapseIntoLeft();
    else restoreToRight();
  }

  const mo = new MutationObserver(debounce(() => {
    rightInner = null;
    leftInner  = null;
    anchorEl   = null;
    ensureTargets();
    onResizeOrInit();
  }, 150));

  function start() {
    ensureTargets();
    onResizeOrInit();

    window.addEventListener('resize', debounce(onResizeOrInit, 120), { passive: true });

    mo.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();