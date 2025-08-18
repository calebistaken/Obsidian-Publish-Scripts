// ===============================================================
// Obsidian Publish — Move Right Sidebar into Left (≤ 1000px)
// Insert just ABOVE `.nav-view-outer` inside the left sidebar
// ===============================================================
(() => {
  const BREAKPOINT_PX = 1000;

  // Selectors
  const RIGHT_INNER_SEL =
    '.site-body-right-column-inner, .right-column .site-body-right-column-inner';
  const LEFT_INNER_CANDIDATES = [
    '.site-body-left-column-inner',
    '.left-column .site-body-left-column-inner',
    '.site-body-left-column nav.site-nav',
    '.site-body-left-column',
    '.left-column',
  ];

  // Anchor we will insert above (so content lands below search)
  const NAV_OUTER_CANDIDATES = [
    '.nav-view-outer',          // your requested anchor
    '.site-nav .nav-view-outer' // fallback if nested
  ];

  // (Optional) search ref—used only if nav is missing and we need a fallback
  const SEARCH_CANDIDATES = [
    '.search',
    '.page-search',
    '.site-search'
  ];

  // State
  let hasCollapsed = false;
  let rightInner = null;
  let leftInner  = null;
  let navOuter   = null;

  const rightPlaceholder = document.createComment('RIGHT_COLUMN_ORIGINAL_SLOT');
  let transplantedWrapper = null;

  const debounce = (fn, wait = 120) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const qsaFirst = (selectors, root = document) => {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  function resolveTargets() {
    if (!rightInner) rightInner = document.querySelector(RIGHT_INNER_SEL);

    // Find an anchor for insertion (nav)
    if (!navOuter) navOuter = qsaFirst(NAV_OUTER_CANDIDATES);

    // Resolve the correct "left inner" container AS THE CONTAINER THAT HOLDS nav
    if (!leftInner) {
      if (navOuter) {
        // Prefer the closest known left-inner ancestor of nav
        leftInner =
          navOuter.closest(LEFT_INNER_CANDIDATES.join(',')) ||
          navOuter.parentElement;
      } else {
        // Fallback: try to find a reasonable left container anyway
        leftInner = qsaFirst(LEFT_INNER_CANDIDATES);
      }
    }

    // Ensure placeholder marks the right column’s original slot
    if (rightInner && !rightPlaceholder.parentNode) {
      rightInner.parentNode.insertBefore(rightPlaceholder, rightInner);
    }

    return !!(rightInner && leftInner);
  }

  function collapseIntoLeft() {
    if (hasCollapsed) return;
    if (!resolveTargets()) return;

    if (!transplantedWrapper) {
      transplantedWrapper = document.createElement('div');
      transplantedWrapper.className = 'moved-right-sidebar-wrapper';
      transplantedWrapper.setAttribute('data-origin', 'right-sidebar');
      // Ensure it behaves like a normal block in the left column
      transplantedWrapper.style.display = 'block';
      transplantedWrapper.style.width = '100%';
    }

    const movingNodes = Array.from(rightInner.childNodes);
    if (!movingNodes.length) return;

    movingNodes.forEach((n) => transplantedWrapper.appendChild(n));

    // PRIMARY: insert directly ABOVE the nav container, so it lands below search
    if (navOuter && navOuter.parentNode) {
      navOuter.parentNode.insertBefore(transplantedWrapper, navOuter);
    } else {
      // FALLBACK: if nav is missing, put at top of left inner (still inside it)
      leftInner.insertBefore(transplantedWrapper, leftInner.firstChild);
      // Secondary fallback: try to place after search if we can find it
      const searchEl = qsaFirst(SEARCH_CANDIDATES, leftInner);
      if (searchEl && searchEl.parentNode && transplantedWrapper.parentNode === leftInner) {
        searchEl.parentNode.insertBefore(transplantedWrapper, searchEl.nextSibling);
      }
    }

    hasCollapsed = true;
    document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
  }

  function restoreToRight() {
    if (!hasCollapsed) return;
    if (!resolveTargets()) return;

    if (transplantedWrapper && transplantedWrapper.childNodes.length) {
      const toReturn = Array.from(transplantedWrapper.childNodes);
      toReturn.forEach((n) => rightInner.appendChild(n));
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

  // Watch for layout rehydrations/swaps
  const mo = new MutationObserver(debounce(() => {
    // Re-resolve anchors/containers and re-apply desired state
    rightInner = null;
    leftInner  = null;
    navOuter   = null;
    resolveTargets();
    onResizeOrInit();
  }, 150));

  function start() {
    resolveTargets();
    onResizeOrInit();

    window.addEventListener('resize', debounce(onResizeOrInit, 120), { passive: true });

    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();