/**
 * Prev | Contents | Next navigation for Obsidian Publish
 * - Honors window.CONTENTS_TITLE (fallback provided)
 * - Works on SPA route changes and initial render
 * - iOS-visible debug banner on errors
 */
((w) => {
  const SAME_FOLDER_ONLY = true;
  const ORDER_BY_FILENAME = false;

  const DEFAULT_CONTENTS_TITLE = '🗺️ Journey Map • Cities & Stories';
  const CONTENTS_TITLE =
    (w && typeof w.CONTENTS_TITLE === 'string' && w.CONTENTS_TITLE.trim())
      ? w.CONTENTS_TITLE.trim()
      : DEFAULT_CONTENTS_TITLE;

  const NAV_CLASS = 'note-nav';
  const STYLE_ID = 'note-nav-style';

  // Minimal debug banner (visible on iOS)
  const dbg = (msg) => {
    let el = document.getElementById('nav-debug-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nav-debug-banner';
      Object.assign(el.style, {
        position:'fixed', left:'8px', bottom:'8px', zIndex:'999999',
        background:'rgba(0,0,0,.75)', color:'#fff', padding:'6px 8px',
        borderRadius:'6px', font:'12px -apple-system, system-ui, sans-serif',
        maxWidth:'80vw', lineHeight:'1.25'
      });
      document.body.appendChild(el);
      setTimeout(()=> el.remove(), 6000);
    }
    el.textContent = String(msg);
  };

  // Inject default styling once
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${NAV_CLASS}{display:flex;justify-content:center;gap:.25rem;margin:1rem 0;font-size:.95rem}
      .${NAV_CLASS}__link{text-decoration:none}
      .${NAV_CLASS}__link[href]{text-decoration:underline}
      .${NAV_CLASS}__sep{opacity:.6}
      .${NAV_CLASS}__link:not([href]){opacity:.4;pointer-events:none;text-decoration:none}
    `;
    document.head.appendChild(style);
  };

  // Build one nav node
  const mkLink = (item, label) => {
    const a = document.createElement(item ? 'a' : 'span');
    a.className = `${NAV_CLASS}__link`;
    a.textContent = label;
    if (item) a.href = `/${item.path}`;
    return a;
  };
  const mkNav = (prev, contents, next) => {
    const nav = document.createElement('nav');
    nav.className = NAV_CLASS;
    nav.setAttribute('aria-label', 'Note navigation');
    const sep = () => {
      const s = document.createElement('span');
      s.className = `${NAV_CLASS}__sep`;
      s.textContent = ' | ';
      return s;
    };
    nav.append(mkLink(prev,'Prev'), sep(), mkLink(contents,'Contents'), sep(), mkLink(next,'Next'));
    return nav;
  };

  // Title normalizer (handles emoji/punctuation/case)
  const norm = (s) => String(s || '')
    .normalize('NFKD')
    .replace(/\p{Extended_Pictographic}/gu,'')      // strip emoji
    .replace(/[^\p{L}\p{N}]+/gu,' ')                // collapse punctuation
    .trim()
    .toLowerCase();

  // Fetch and normalize search index (cache in-memory per session)
  let PAGES = null;
  const getPages = async () => {
    if (PAGES) return PAGES;
    const res = await fetch('/search.json', { cache: 'no-store' });
    const idx = await res.json();
    const raw = (idx.pages ?? idx ?? []);
    PAGES = raw.map(p => {
      const rawPath = (p.path || p.relativePath || (p.url || '').replace(/^\//, '') || '');
      const path = rawPath.replace(/\.md$/i, '');
      if (!path) return null;
      const basename = path.split('/').pop() || '';
      const title = (p.title || p.basename || basename.replace(/-/g,' ')).trim();
      const parent = path.split('/').slice(0,-1).join('/');
      return { path, title, parent, basename };
    }).filter(Boolean);
    return PAGES;
  };

  // Compute neighbors for current page
  const compute = async () => {
    const pages = await getPages();
    const rawCurrent = decodeURIComponent(location.pathname.replace(/^\/|\.html?$/gi, ''));
    const currentSlug = rawCurrent.endsWith('/') ? rawCurrent.slice(0,-1) : rawCurrent;
    const folder = currentSlug.split('/').slice(0,-1).join('/');
    const set = pages.filter(p => SAME_FOLDER_ONLY ? p.parent === folder : true)
      .sort(ORDER_BY_FILENAME
        ? (a,b)=>a.basename.localeCompare(b.basename, undefined, {sensitivity:'base'})
        : (a,b)=>a.title.localeCompare(b.title, undefined, {sensitivity:'base'}));
    const i = set.findIndex(p => p.path === currentSlug);
    if (i === -1) throw new Error(`Current page not in search index: /${currentSlug}`);
    const prev = i>0 ? set[i-1] : null;
    const next = i<set.length-1 ? set[i+1] : null;

    const want = norm(CONTENTS_TITLE);
    const contents =
         set.find(p => norm(p.title) === want)
      || set.find(p => norm(p.basename) === want)
      || set.find(p => norm(p.title).startsWith(want))
      || null;

    return { prev, contents, next };
  };

  // Insert nav at top and bottom of the content area
  const mount = async () => {
    ensureStyle();
    let container =
      document.querySelector('.markdown-preview-view') ||
      document.querySelector('.markdown-preview-section') ||
      document.querySelector('#content') ||
      document.body;

    // Remove any previous bars in this container (avoid duplicates on SPA nav)
    container.querySelectorAll(`.${NAV_CLASS}`).forEach(n => n.remove());

    try {
      const { prev, contents, next } = await compute();
      const topNav = mkNav(prev, contents, next);
      const firstBlock = container.firstElementChild;
      if (firstBlock) container.insertBefore(topNav, firstBlock);
      else container.appendChild(topNav);
      container.appendChild(mkNav(prev, contents, next));
    } catch (e) {
      dbg(`Nav error: ${e.message || e}`);
    }
  };

  // Observe SPA route/content changes and (re)mount
  const boot = () => {
    mount(); // first attempt

    // Re-run on URL changes (simple SPA watcher)
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        setTimeout(mount, 60); // allow new content to render
      }
    }, 150);

    // Re-run when the main content area changes (initial render timing)
    const obs = new MutationObserver(() => {
      if (!document.querySelector(`.${NAV_CLASS}`)) mount();
    });
    obs.observe(document.documentElement, { childList:true, subtree:true });
  };

  // Start after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})(window);