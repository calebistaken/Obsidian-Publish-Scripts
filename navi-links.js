/**
 * Prev | Contents | Next navigation for Obsidian Publish (custom domain safe)
 * - Parses PrevNote/NextNote from rendered frontmatter
 * - Waits for frontmatter to appear, recomputes on route/mutation
 * - Encodes paths like Publish (+ for spaces, %26 for &)
 * - Uses absolute links to custom domain to bypass <base> hijack
 
 * - in the script that imports this one, set 
   - window.CONTENTS_TITLE = [title of the contents/home page]
*/

(() => {
  const NAV_CLASS = 'note-nav';
  const STYLE_ID = 'note-nav-style';
  const DEFAULT_CONTENTS_TITLE = '🗺️ Journey Map • Cities & Stories';

  const CONTENTS_TITLE =
    (typeof window.CONTENTS_TITLE === 'string' && window.CONTENTS_TITLE.trim())
      ? window.CONTENTS_TITLE.trim()
      : DEFAULT_CONTENTS_TITLE;

  const CONTENTS_PATH =
    (typeof window.CONTENTS_PATH === 'string' && window.CONTENTS_PATH.trim())
      ? window.CONTENTS_PATH.trim().replace(/^\//,'').replace(/\.md$/i,'')
      : null;

  // Ensure links always go to your custom domain
  const BASE_ORIGIN = (window.siteInfo && window.siteInfo.customurl)
    ? ('https://' + window.siteInfo.customurl.replace(/^https?:\/\//,'').replace(/\/$/,''))
    : (location.origin || 'https://publish.obsidian.md');

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

  const encodePathForPublish = (path) => {
    const clean = String(path || '').replace(/^\//,'').replace(/\.md$/i,'');
    return encodeURI(clean).replace(/%20/g, '+').replace(/&/g, '%26');
  };

  const mkLink = (item, label) => {
    const el = document.createElement(item ? 'a' : 'span');
    el.className = `${NAV_CLASS}__link`;
    el.textContent = label;
    if (item) {
      const path = '/' + encodePathForPublish(item.path);
      el.href = new URL(path, BASE_ORIGIN).href; // absolute link
    }
    return el;
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

  // Frontmatter selectors
  const qFrontmatterNodes = (root=document) => root.querySelectorAll([
    '.el-pre.mod-frontmatter.mod-ui pre.language-yaml code.language-yaml',
    '.el-pre.mod-frontmatter.mod-ui code.language-yaml',
    'pre.frontmatter.language-yaml code.language-yaml',
    'pre.language-yaml code.language-yaml',
    'code.language-yaml',
    '.frontmatter code.language-yaml',
    '.metadata-container table',
    '.frontmatter-container table',
    '.frontmatter table'
  ].join(','));

  const parseFromTokens = (codeEl) => {
    const out = { PrevNote:null, NextNote:null };
    const tokens = Array.from(codeEl.querySelectorAll('.token'));
    if (!tokens.length) return out;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!(t.classList.contains('key') && t.classList.contains('atrule'))) continue;
      const key = t.textContent.trim();
      if (key !== 'PrevNote' && key !== 'NextNote') continue;
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
    return out;
  };

  const parseFromRawText = (codeEl) => {
    const out = { PrevNote:null, NextNote:null };
    const text = (codeEl.innerText || codeEl.textContent || '').replace(/&amp;/g, '&');
    const rx = /^(PrevNote|NextNote)\s*:\s*["']?\s*(\[\[[^\]]+\]\])\s*["']?\s*$/gmi;
    let m;
    while ((m = rx.exec(text))) {
      const key = m[1];
      const wiki = m[2];
      const mm = wiki.match(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/);
      if (mm) out[key] = { target: mm[1].trim(), alias: (mm[2]||'').trim() || null };
    }
    return out;
  };

  const parseFromTable = (tableEl) => {
    const out = { PrevNote:null, NextNote:null };
    const rows = tableEl.querySelectorAll('tr');
    rows.forEach(tr => {
      const k = tr.querySelector('th, td:first-child');
      const v = tr.querySelector('td:last-child');
      if (!k || !v) return;
      const key = k.textContent.trim();
      if (key !== 'PrevNote' && key !== 'NextNote') return;
      const mm = v.textContent.match(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/);
      if (mm) out[key] = { target: mm[1].trim(), alias: (mm[2]||'').trim() || null };
    });
    return out;
  };

  const readPrevNextFromFrontmatter = (root=document) => {
    const nodes = qFrontmatterNodes(root);
    let res = { PrevNote:null, NextNote:null };
    nodes.forEach(node => {
      if (node.tagName === 'TABLE') {
        const got = parseFromTable(node);
        res = { ...res, ...got };
      } else {
        const tokenRes = parseFromTokens(node);
        const rawRes = parseFromRawText(node);
        res = {
          PrevNote: tokenRes.PrevNote || rawRes.PrevNote || res.PrevNote,
          NextNote: tokenRes.NextNote || rawRes.NextNote || res.NextNote
        };
      }
    });
    return res;
  };

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
    document.querySelectorAll(`.${NAV_CLASS}`).forEach(n => n.remove());
    const container =
      document.querySelector('#content') ||
      document.querySelector('.markdown-preview-view') ||
      document.querySelector('.markdown-preview-section') ||
      document.body;
    const { prev, contents, next } = compute();
    const topNav = mkNav(prev, contents, next);
    const firstBlock = container.firstElementChild;
    if (firstBlock) container.insertBefore(topNav, firstBlock);
    else container.appendChild(topNav);
    container.appendChild(mkNav(prev, contents, next));
  };

  const frontmatterReady = () => qFrontmatterNodes(document).length > 0;

  const waitForFrontmatter = (cb) => {
    if (frontmatterReady()) { cb(); return; }
    const obs = new MutationObserver(() => {
      if (frontmatterReady()) { obs.disconnect(); cb(); }
    });
    obs.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => { if (frontmatterReady()) { obs.disconnect(); cb(); } }, 2000);
  };

  const debounced = (fn, ms=80) => {
    let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  };

  const boot = () => {
    if (localStorage.getItem('nav:disable') === '1' || window.NAV_DISABLE) return;
    waitForFrontmatter(mount);
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        waitForFrontmatter(mount);
      }
    }, 150);
    const recompute = debounced(() => waitForFrontmatter(mount), 120);
    const container =
      document.querySelector('#content') ||
      document.body;
    const obs = new MutationObserver(recompute);
    obs.observe(container, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();