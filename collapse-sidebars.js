// ====================================================================
// Obsidian Publish — Combine Sidebars (≤ 1000px) inside the Left Sidebar
// Left pane = original left sidebar content below search
// Right pane = the content of the right sidebar
//
// Behavior:
// - ≤ 1000px: create a 2-column row inside the left sidebar, placing
//   the left content (below search) and the moved right content side-by-side.
//   The left sidebar becomes min(100vw, leftWidth + rightWidth).
// - ≥ 1001px: restore everything to the native layout.
//
// Tunables:
// - BREAKPOINT_PX   : 1000 (inclusive)
// - LEFT_START_ANCH : '.nav-view-outer' (first block below search)
// - RIGHT_INNER_SEL : right-column inner container
//
// Notes:
// - Uses placeholders to restore DOM order precisely.
// - Preserves event handlers (moves, not clones).
// - Adds a small, theme-aware CSS block automatically.
// ====================================================================
(() => {
  const BREAKPOINT_PX   = 1000;

  // Selectors (adjust if your theme differs)
  const RIGHT_INNER_SEL = '.site-body-right-column-inner, .right-column .site-body-right-column-inner';
  const LEFT_INNER_SEL  = '.site-body-left-column-inner, .left-column .site-body-left-column-inner, .site-body-left-column';
  const LEFT_COL_SEL    = '.site-body-left-column, .left-column';
  const SEARCH_SEL_CAND = ['.search', '.page-search', '.site-search'];
  const LEFT_START_ANCH = '.nav-view-outer'; // we'll treat this as "left content starts here"

  // IDs for created nodes
  const STYLE_ID        = 'combined-sidebars-style';
  const WRAP_ID         = 'combined-sidebars-wrap';
  const LEFT_PANE_ID    = 'combined-left-pane';
  const RIGHT_PANE_ID   = 'combined-right-pane';

  // Internal state
  let hasCombined = false;
  let rightInner  = null;
  let leftInner   = null;
  let leftColumn  = null;
  let leftStart   = null; // anchor inside left where the "left group" begins

  // Placeholders: where to put stuff back
  const RIGHT_SLOT = document.createComment('RIGHT_COLUMN_ORIGINAL_SLOT');
  const LEFT_SLOT  = document.createComment('LEFT_GROUP_ORIGINAL_SLOT');

  const debounce = (fn, wait = 120) => {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  const qsaFirst = (selectors, root = document) => {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  function ensureTargets() {
    if (!rightInner) rightInner = document.querySelector(RIGHT_INNER_SEL);
    if (!leftInner)  leftInner  = document.querySelector(LEFT_INNER_SEL);
    if (!leftColumn) leftColumn = document.querySelector(LEFT_COL_SEL);
    if (!leftStart && leftInner) leftStart = leftInner.querySelector(LEFT_START_ANCH);

    // Fallback: if no explicit start anchor, try right below search
    if (!leftStart && leftInner) {
      const search = qsaFirst(SEARCH_SEL_CAND, leftInner);
      if (search && search.parentNode) {
        // start = node after search
        leftStart = search.nextElementSibling || search.nextSibling;
      }
    }

    // Ensure placeholders exist in-place
    if (rightInner && !RIGHT_SLOT.parentNode) {
      rightInner.parentNode.insertBefore(RIGHT_SLOT, rightInner);
    }
    if (leftStart && leftStart.parentNode && !LEFT_SLOT.parentNode) {
      leftStart.parentNode.insertBefore(LEFT_SLOT, leftStart);
    }

    return !!(rightInner && leftInner && leftColumn);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      :root {
        /* fallbacks if your theme doesn't define these */
        --sidebar-left-width:  300px;
        --sidebar-right-width: 300px;
      }

      /* When combined */
      html[data-sidebars-combined="true"] ${LEFT_COL_SEL} {
        /* The left column widens to fit both sidebars, but never exceed viewport */
        width: min(100vw, calc(var(--sidebar-left-width) + var(--sidebar-right-width)));
      }

      /* Restore width in separate mode happens automatically when attribute is removed */

      /* Wrap holding both panes side-by-side */
      #${WRAP_ID} {
        display: flex;
        flex-direction: row;
        gap: var(--size-4-2);
        width: 100%;
        box-sizing: border-box;
        /* keeps combined row from touching edges if your theme adds padding */
      }

      /* Left pane keeps its nominal width */
      #${LEFT_PANE_ID} {
        flex: 0 0 var(--sidebar-left-width);
        min-width: 0;
        overflow: hidden; /* left pane generally manages its own scrollable areas */
      }

      /* Right pane uses the right width and can scroll vertically on overflow */
      #${RIGHT_PANE_ID} {
        flex: 0 0 var(--sidebar-right-width);
        min-width: 0;
        max-height: 80vh;              /* prevent overgrowth */
        overflow: auto;                /* allow independent vertical scroll */
        -webkit-overflow-scrolling: touch;
        border-left: 1px solid var(--background-modifier-border);
        padding-left: var(--size-4-2);
      }

      /* Minor niceties */
      html[data-sidebars-combined="true"] .site-body-right-column {
        display: none; /* hide the native right column shell when combined */
      }
    `.trim();

    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function getOrCreateWrap() {
    let wrap = document.getElementById(WRAP_ID);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = WRAP_ID;

      const leftPane  = document.createElement('div');
      leftPane.id     = LEFT_PANE_ID;

      const rightPane = document.createElement('div');
      rightPane.id    = RIGHT_PANE_ID;

      wrap.appendChild(leftPane);
      wrap.appendChild(rightPane);
    }
    return wrap;
  }

  function combineSidebars() {
    if (hasCombined) return;
    if (!ensureTargets()) return;

    ensureStyle();

    const wrap = getOrCreateWrap();
    const leftPane  = wrap.querySelector('#' + LEFT_PANE_ID);
    const rightPane = wrap.querySelector('#' + RIGHT_PANE_ID);

    // 1) Move RIGHT content -> rightPane
    const rightKids = Array.from(rightInner.childNodes);
    rightKids.forEach(n => rightPane.appendChild(n));

    // 2) Move LEFT "group" (everything starting from leftStart to the end of leftInner)
    //    into leftPane (so it sits beside rightPane)
    if (leftStart) {
      // Place LEFT_SLOT before leftStart if not already done (done in ensureTargets)
      const group = [];
      let cursor = leftStart;
      while (cursor) {
        const next = cursor.nextSibling;
        group.push(cursor);
        cursor = next;
      }
      group.forEach(n => leftPane.appendChild(n));
    } else {
      // If no good anchor, leave left as-is and only add rightPane after search
      // Insert wrap but keep leftPane empty so existing left content stays above wrap.
    }

    // 3) Insert the wrap into the leftInner (just before LEFT_SLOT will place it
    //    approximately where left content used to begin).
    if (!wrap.parentNode) {
      if (LEFT_SLOT.parentNode) {
        LEFT_SLOT.parentNode.insertBefore(wrap, LEFT_SLOT.nextSibling);
      } else {
        leftInner.appendChild(wrap);
      }
    }

    hasCombined = true;
    document.documentElement.setAttribute('data-sidebars-combined', 'true');
  }

  function separateSidebars() {
    if (!hasCombined) return;
    if (!ensureTargets()) return;

    const wrap = document.getElementById(WRAP_ID);
    const leftPane  = wrap && wrap.querySelector('#' + LEFT_PANE_ID);
    const rightPane = wrap && wrap.querySelector('#' + RIGHT_PANE_ID);

    // 1) Restore RIGHT content back to rightInner
    if (rightPane) {
      const rightKids = Array.from(rightPane.childNodes);
      rightKids.forEach(n => rightInner.appendChild(n));
    }

    // 2) Restore LEFT group back to where it started (after LEFT_SLOT)
    if (leftPane && LEFT_SLOT.parentNode) {
      const leftKids = Array.from(leftPane.childNodes);
      // Put them back right after the LEFT_SLOT
      let insertAfter = LEFT_SLOT;
      leftKids.forEach(n => {
        insertAfter.parentNode.insertBefore(n, insertAfter.nextSibling);
        insertAfter = n;
      });
    }

    // 3) Remove the wrap container (keep it for reuse if you prefer; we’ll rebuild if needed)
    if (wrap && wrap.parentNode) {
      wrap.parentNode.removeChild(wrap);
    }

    hasCombined = false;
    document.documentElement.removeAttribute('data-sidebars-combined');
  }

  function onResizeOrInit() {
    const shouldCombine = window.innerWidth <= BREAKPOINT_PX; // combine at 1000 and below
    if (shouldCombine) combineSidebars();
    else separateSidebars();
  }

  // Observe large DOM changes (SPA rehydrates, etc.)
  const mo = new MutationObserver(debounce(() => {
    rightInner = null;
    leftInner  = null;
    leftColumn = null;
    leftStart  = null;
    ensureTargets();
    onResizeOrInit();
  }, 150));

  function start() {
    ensureTargets();
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