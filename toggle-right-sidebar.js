/* =========================================================================
   Obsidian Publish — Right Sidebar Toggle with Native Breakpoints
   - ≤750px: mutual exclusivity (open one closes the other)
   - 751–1000px: left locked open; right toggles independently
   - >1000px: both sidebars visible; hide right toggle; don't interfere
   - Persists right sidebar state across page loads below 1000px
   ========================================================================= */
(() => {
  const BTN_ID          = 'right-sidebar-toggle';
  const BODY_R_HIDDEN   = 'right-sidebar-hidden';
  const BODY_L_HIDDEN   = 'left-sidebar-hidden';

  const BP_LEFT_LOCK    = 750;   // >750: left is always visible (Publish default)
  const BP_BOTH_VISIBLE = 1000;  // >1000: both are always visible (Publish default)

  const STORE_RIGHT     = 'obsidian-publish:rightSidebarOpen';   // '1'|'0'
  const STORE_LAST      = 'obsidian-publish:lastOpenedSidebar';  // 'left'|'right'

  const qs  = (s, r=document) => r.querySelector(s);

  const leftCol  = qs('.site-body-left-column');
  const rightCol = qs('.site-body-right-column');
  if (!leftCol || !rightCol) return;

  // Try to mirror the native left toggle’s look for the right-side button
  const leftToggle = qs('.sidebar-toggle-button, .site-header-sidebar-button, .left-toggle, button[aria-label*="sidebar" i]');

  const isWideLeftLock  = () => window.innerWidth > BP_LEFT_LOCK;
  const isWideBothOpen  = () => window.innerWidth > BP_BOTH_VISIBLE;

  const getRightOpen = () => (localStorage.getItem(STORE_RIGHT) ?? '1') === '1';
  const setRightOpen = (open, {mutual=true} = {}) => {
    localStorage.setItem(STORE_RIGHT, open ? '1' : '0');
    document.body.classList.toggle(BODY_R_HIDDEN, !open);
    updateRightBtn(open);
    if (open) localStorage.setItem(STORE_LAST, 'right');

    // Mutual exclusivity only applies at ≤750px
    if (mutual && !isWideLeftLock()) {
      setLeftOpen(false, {mutual:false});
    }
  };

  // We don’t actually control the left sidebar’s native state—only add/remove a class for ≤750 px.
  const setLeftOpen = (open, {mutual=true} = {}) => {
    // Only meaningful at ≤750 px. Above that, left is always visible by default.
    if (!isWideLeftLock()) {
      document.body.classList.toggle(BODY_L_HIDDEN, !open);
      if (open) localStorage.setItem(STORE_LAST, 'left');
      if (mutual && open) setRightOpen(false, {mutual:false});
    } else {
      // Ensure visible when left is locked open
      document.body.classList.remove(BODY_L_HIDDEN);
    }
  };

  const ensureRightButton = () => {
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;

    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'sidebar-toggle-button mod-right';
    btn.addEventListener('click', () => {
      const next = !getRightOpen();
      setRightOpen(next, {mutual:true});
    });

    // Mirror left toggle’s inner markup if available
    if (leftToggle) btn.innerHTML = leftToggle.innerHTML;
    else {
      btn.innerHTML = `
        <span class="toggle-icon" aria-hidden="true" style="display:inline-block;width:1.25em;">
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
            <rect x="3" y="6"  width="18" height="2" rx="1"></rect>
            <rect x="3" y="11" width="18" height="2" rx="1"></rect>
            <rect x="3" y="16" width="18" height="2" rx="1"></rect>
          </svg>
        </span>`;
    }

    const headerMount =
      qs('.site-header, .site-header-inner, header') ||
      leftCol.parentElement || document.body;
    headerMount.appendChild(btn);
    updateRightBtn(getRightOpen());
    return btn;
  };

  const updateRightBtn = (open) => {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(open));
    btn.setAttribute('aria-label', open ? 'Hide right sidebar' : 'Show right sidebar');
    btn.title = open ? 'Hide right sidebar' : 'Show right sidebar';
  };

  const applyLayoutRules = () => {
    ensureRightButton();
    const rightOpen = getRightOpen();

    if (isWideBothOpen()) {
      // >1000px — Let Publish do its thing: both visible, hide our toggle
      document.body.classList.remove(BODY_L_HIDDEN, BODY_R_HIDDEN);
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.style.display = 'none';
      return;
    }

    // 751–1000px — left locked open; right per saved state; show right toggle
    if (isWideLeftLock()) {
      document.body.classList.remove(BODY_L_HIDDEN); // ensure left visible
      document.body.classList.toggle(BODY_R_HIDDEN, !rightOpen);
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.style.display = '';
      updateRightBtn(rightOpen);
      return;
    }

    // ≤750px — mutual exclusivity + show both toggles
    // Start: both hidden, then open whichever is persisted/last
    document.body.classList.add(BODY_L_HIDDEN, BODY_R_HIDDEN);
    const last = localStorage.getItem(STORE_LAST) || 'right';

    if (last === 'left') {
      setLeftOpen(true, {mutual:true});
    } else {
      setRightOpen(getRightOpen(), {mutual:true});
      if (!getRightOpen()) setLeftOpen(true, {mutual:true}); // guarantee one visible
    }

    const btn = document.getElementById(BTN_ID);
    if (btn) btn.style.display = '';
  };

  // Initial paint: reflect saved right state; don’t hide left above 750
  if (!isWideLeftLock()) {
    document.body.classList.toggle(BODY_R_HIDDEN, !getRightOpen());
  } else {
    document.body.classList.remove(BODY_L_HIDDEN);
    document.body.classList.toggle(BODY_R_HIDDEN, !getRightOpen());
  }

  applyLayoutRules();

  // Resize/orientation: debounce for stability
  let t;
  const onResize = () => {
    clearTimeout(t);
    t = setTimeout(applyLayoutRules, 100);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // If the native left toggle exists, only enforce mutual exclusivity at ≤750px
  if (leftToggle) {
    leftToggle.addEventListener('click', () => {
      if (isWideBothOpen()) return;             // desktop: ignore
      if (isWideLeftLock()) return;             // 751–1000: left is locked open
      // ≤750: emulate mutual exclusivity
      const leftHidden = document.body.classList.contains(BODY_L_HIDDEN);
      setLeftOpen(leftHidden, {mutual:true});   // clicking flips it
    }, true);
  }
})();