/**
 * Prev | Contents | Next navigation for Obsidian Publish
 * - Uses rendered frontmatter only (PrevNote/NextNote) — no network
 * - Contents link honors window.CONTENTS_TITLE (or window.CONTENTS_PATH)
 * - Fixes: no duplicate bars; href encoding matches Publish scheme (+ for spaces, %26 for &)
 */
((w) => {
  const DEFAULT_CONTENTS_TITLE = '🗺️ Journey Map • Cities & Stories';
  const CONTENTS_TITLE =
    (w && typeof w.CONTENTS_TITLE === 'string' && w.CONTENTS_TITLE.trim())
      ? w.CONTENTS_TITLE.trim()
      : DEFAULT_CONTENTS_TITLE;

  // Optional exact path override (e.g., "2017 🛕 Varanasi & Back/Journey Map"; no leading slash, no .md)
  const CONTENTS_PATH =
    (w && typeof w.CONTENTS_PATH === 'string' && w.CONTENTS_PATH.trim())
      ? w.CONTENTS_PATH.trim().replace(/^\//,'').replace(/\.md$/i,'')
      : null;

  const NAV_CLASS = 'note-nav';
  const STYLE_ID = 'note-nav-style';

  // ---------- Styles ----------
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

  // ---------- URL encoding to match your site ----------
  // Use encodeURI, then convert spaces to '+', and escape '&' to '%26'
  const encodePathForPublish = (path) => {
    const clean = String(path || '').replace(/^\//,'').replace(/\.md$/i,'');
    return encodeURI(clean).replace(/%20/g, '+').replace(/&/g, '%26');
  };

  // ---------- Elements ----------
  const mkLink = (item, label) => {
    const a = document.createElement(item ? 'a' : 'span');
    a.className = `${NAV_CLASS}__link`;
    a.textContent = label;
    if (item) a.href = '/' + encodePathForPublish(item.path);
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

  // ---------- Utils ----------
  const safeCurrentSlug = () => {
    const raw = location.pathname.replace(/^\/|\.html?$/gi, '');
    try {
      return (/%[0-9A-Fa-f]{2}/.test(raw) || /%/.test(raw))
        ? decodeURIComponent(raw)
        : raw;
    } catch {
      try { return decodeURIComponent(raw.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')); }
      catch { return raw; }
    }
  };

  const resolveWikiPath = (target, currentSlug) => {
    const hasSlash = target.includes('/');
    const baseFolder = currentSlug.split('/').slice(0,-1).join('/');
    const path = hasSlash ? target : (baseFolder ? baseFolder + '/' + target : target);
    return path.replace(/\.md$/i,'');
  };

  const guessContentsPath = (currentSlug) => {
    if (CONTENTS_PATH) return CONTENTS_PATH;
    const baseFolder = currentSlug.split('/').slice(0,-1).join('/');
    return (baseFolder ? baseFolder + '/' : '') + CONTENTS_TITLE.replace(/\.md$/i,'');
  };

  // ---------- Frontmatter extraction ----------
  function readPrevNextFromFrontmatter(root = document) {
    const out = { PrevNote: null, NextNote: null };

    // Table-style frontmatter
    const table = root.querySelector('.frontmatter, .metadata-container, .frontmatter-container');
    if (table) {
      table.querySelectorAll('tr').forEach(tr => {
        const k = tr.querySelector('th, td:first-child');
        const v = tr.querySelector('td:last-child');
        if (!k || !v) return;
        const key = k.textContent.trim();
        if (key === 'PrevNote' || key === 'NextNote') {
          const m = v.textContent.match(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/);
          if (m) out[key] = { target: m[1].trim(), alias: (m[2]||'').trim() || null };
        }
      });
      if (out.PrevNote || out.NextNote) return out;
    }

    // Prism-highlighted YAML
    const code = root.querySelector('.frontmatter pre, .frontmatter code, .frontmatter .language-yaml, pre.language-yaml, code.language-yaml');
    if (code) {
      const tokens = Array.from(code.querySelectorAll('.token'));
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!(t.classList.contains('key') && t.classList.contains('atrule'))) continue;
        const key = t.textContent.trim();
        if (key !== 'PrevNote' && key !== 'NextNote') continue;

        // Find next .token.string
        let j = i + 1, strNode = null;
        while (j < tokens.length) {
          const tj = tokens[j];
          if (tj.classList.contains('string')) { strNode = tj; break; }
          if (tj.classList.contains('key') || /\n/.test(tj.textContent)) break;
          j++;
        }
        if (!strNode) continue;

        const raw = strNode.textContent.trim().replace(/^["']|["']$/g,'');
        const m = raw.match(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/);
        if (m) out[key] = { target: m[1].trim(), alias: (m[2]||'').trim() || null };
      }
    }

    return out;
  }

  // ---------- Compute & Mount ----------
  const compute = () => {
    const currentSlug = safeCurrentSlug().replace(/\/+$/,'');
    const { PrevNote, NextNote } = readPrevNextFromFrontmatter(document);

    const prev = PrevNote ? {
      path: resolveWikiPath(PrevNote.target, currentSlug),
      title: PrevNote.alias || PrevNote.target
    } : null;

    const next = NextNote ? {
      path: resolveWikiPath(NextNote.target, currentSlug),
      title: NextNote.alias || NextNote.target
    } : null;

    const contentsPath = guessContentsPath(currentSlug);
    const contents = contentsPath ? { path: contentsPath, title: CONTENTS_TITLE } : null;

    return { prev, contents, next };
  };

  const mount = () => {
    ensureStyle();

    // Always remove existing bars across the whole document (prevents duplicates)
    document.querySelectorAll(`.${NAV_CLASS}`).forEach(n => n.remove());

    const container =
      document.querySelector('#content') ||
      document.querySelector('.markdown-preview-view') ||
      document.querySelector('.markdown-preview-section') ||
      document.body;

    const { prev, contents, next } = compute();
    if (!prev && !next && !contents) return;

    const topNav = mkNav(prev, contents, next);
    const firstBlock = container.firstElementChild;
    if (firstBlock) container.insertBefore(topNav, firstBlock);
    else container.appendChild(topNav);
    container.appendChild(mkNav(prev, contents, next));
  };

  // ---------- Boot (SPA-safe & de-duped) ----------
  const boot = () => {
    if (localStorage.getItem('nav:disable') === '1' || w.NAV_DISABLE) return;

    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; mount(); }, 60);
    };

    mount();

    // SPA watcher (debounced)
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        schedule();
      }
    }, 150);

    // Mutation watcher (only remount if bars are missing)
    const obs = new MutationObserver(() => {
      if (!document.querySelector(`.${NAV_CLASS}`)) schedule();
    });
    obs.observe(document.documentElement, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})(window);