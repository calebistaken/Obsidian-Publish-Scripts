/**
 * Obsidian Publish — Map banner + "Open in Maps" link
 * - Extracts `map_link` from rendered frontmatter (Prism YAML or table/raw)
 * - Banner ABOVE the H1; "Open in Maps" link BELOW the H1
 * - Uses OSM static tile for preview (no API key), with attribution
 * - Outbound link can prefer Apple/Google/OSM (or auto) and ignores <base>
 *
 * Optional globals (set before this script):
 *   window.MAP_BANNER = true;                   // show banner when coords found
 *   window.MAP_PREF   = 'auto'|'apple'|'google'|'osm'; // click-through target
 *   window.MAP_ZOOM   = 12;                     // banner zoom
 *   window.MAP_HEIGHT = 160;                    // banner height (px)
 *   window.MAP_LINK_WITH_BANNER = true;         // also show "Open in Maps" under title when banner is present
 */
(() => {
  // -------- Config --------
  const MAP_BANNER = (typeof window.MAP_BANNER === 'boolean') ? window.MAP_BANNER : true;
  const MAP_PREF   = (typeof window.MAP_PREF === 'string') ? window.MAP_PREF : 'auto';
  const MAP_ZOOM   = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.MAP_HEIGHT) ? window.MAP_HEIGHT : 160;
  const MAP_LINK_WITH_BANNER = (typeof window.MAP_LINK_WITH_BANNER === 'boolean') ? window.MAP_LINK_WITH_BANNER : true;

  const STYLE_ID   = 'map-banner-style';
  const WRAP_CLASS = 'map-banner-wrap';
  const LINK_CLASS = 'map-inline-link';

  // -------- Styles --------
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      .${WRAP_CLASS}{
        width:100%;
        margin:.75rem 0 1rem 0;
        display:block;
      }
      .${WRAP_CLASS}__inner{
        position:relative;
        width:100%;
        height:${MAP_HEIGHT}px;
        overflow:hidden;
        border-radius: var(--img-border-radius, 8px);
        background:#e5e5e5;
      }
      .${WRAP_CLASS}__img{
        width:100%;
        height:100%;
        object-fit:cover;
        display:block;
      }
      .${WRAP_CLASS}__attribution{
        position:absolute;
        right:.5rem; bottom:.25rem;
        font-size:.75rem; opacity:.75;
        background:rgba(255,255,255,.75);
        padding:.1rem .35rem;
        border-radius:4px;
      }
      .${LINK_CLASS}{
        display:inline-block;
        margin:.25rem 0 .75rem 0;
      }
    `;
    const el = document.createElement('style');
    el.id = STYLE_ID; el.textContent = css;
    document.head.appendChild(el);
  };

  // -------- DOM helpers --------
  const getContainer = () =>
    document.querySelector('#content') ||
    document.querySelector('.markdown-preview-view') ||
    document.querySelector('.markdown-preview-section') ||
    document.body;

  const getTitleNode = () =>
    document.querySelector('.markdown-preview-view h1, #content h1, .view-content h1, h1');

  const insertBanner = (node) => {
    const title = getTitleNode();
    const container = getContainer();
    if (title && title.parentNode) title.parentNode.insertBefore(node, title);
    else container.insertBefore(node, container.firstChild);
  };

  const insertLink = (node) => {
    const title = getTitleNode();
    const container = getContainer();
    if (title && title.parentNode) title.parentNode.insertBefore(node, title.nextSibling);
    else container.insertBefore(node, container.firstChild);
  };

  // -------- Frontmatter parsing (map_link) --------
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

  const parseMapFromTokens = (codeEl) => {
    const tokens = Array.from(codeEl.querySelectorAll('.token'));
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!(t.classList.contains('key') && t.classList.contains('atrule'))) continue;
      if (t.textContent.trim() !== 'map_link') continue;
      let j = i + 1, strNode = null;
      while (j < tokens.length) {
        const tj = tokens[j];
        if (tj.classList.contains('string')) { strNode = tj; break; }
        if (tj.classList.contains('key') || /\n/.test(tj.textContent)) break;
        j++;
      }
      if (!strNode) continue;
      return (strNode.textContent || '').trim().replace(/^["']|["']$/g,'');
    }
    return null;
  };

  const parseMapFromRaw = (node) => {
    if (node.tagName === 'TABLE') {
      for (const tr of node.querySelectorAll('tr')) {
        const k = tr.querySelector('th, td:first-child');
        const v = tr.querySelector('td:last-child');
        if (!k || !v) continue;
        if (k.textContent.trim() === 'map_link') {
          return v.textContent.trim().replace(/^["']|["']$/g,'');
        }
      }
      return null;
    }
    const txt = (node.innerText || node.textContent || '').replace(/&amp;/g,'&');
    const m = txt.match(/^\s*map_link\s*:\s*["']?(.+?)["']?\s*$/mi);
    return m ? m[1].trim() : null;
  };

  const readMapLink = (root=document) => {
    const nodes = qFrontmatterNodes(root);
    for (const n of nodes) {
      const val = (n.tagName === 'TABLE')
        ? parseMapFromRaw(n)
        : (parseMapFromTokens(n) || parseMapFromRaw(n));
      if (val) return val;
    }
    return null;
  };

  // -------- Map normalization --------
  const parseQuery = (u) => {
    const out = Object.create(null);
    for (const [k,v] of u.searchParams.entries()) out[k] = v;
    return out;
  };

  const toFloat = (s) => {
    const n = parseFloat(String(s).trim());
    return Number.isFinite(n) ? n : null;
  };

  const extractLatLon = (str) => {
    if (!str) return null;
    const m = String(str).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat = toFloat(m[1]), lon = toFloat(m[2]);
    return (lat==null || lon==null) ? null : { lat, lon };
  };

  const normalizeMap = (rawUrl) => {
    if (!rawUrl) return null;
    let href = rawUrl.replace(/&amp;/g,'&').trim();
    if (!/^https?:\/\//i.test(href)) return null;

    let u;
    try { u = new URL(href); }
    catch { return { provider:'unknown', href, lat:null, lon:null }; }

    const host = u.hostname.toLowerCase();

    if (host.endsWith('maps.apple.com')) {
      const q = parseQuery(u);
      const ll = q.ll || q.sll || null;
      const coords = extractLatLon(ll) || extractLatLon(q.q);
      return { provider:'apple', href: u.href, lat: coords?.lat ?? null, lon: coords?.lon ?? null };
    }
    if (host.includes('google.') && u.pathname.toLowerCase().includes('/maps')) {
      const atPath = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const q = parseQuery(u);
      const coords =
        (atPath && { lat: toFloat(atPath[1]), lon: toFloat(atPath[2]) }) ||
        extractLatLon(q.q) || extractLatLon(q.query);
      return { provider:'google', href: u.href, lat: coords?.lat ?? null, lon: coords?.lon ?? null };
    }
    if (host.includes('openstreetmap.org')) {
      const q = parseQuery(u);
      let lat = toFloat(q.mlat), lon = toFloat(q.mlon);
      if (lat==null || lon==null) {
        const m = (u.hash || '').match(/map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
        if (m) { lat = toFloat(m[1]); lon = toFloat(m[2]); }
      }
      return { provider:'osm', href: u.href, lat: lat ?? null, lon: lon ?? null };
    }
    return { provider:'unknown', href: u.href, lat:null, lon:null };
  };

  const formatOutLink = (info) => {
    const { provider, href, lat, lon } = info;
    if (lat==null || lon==null) return href;
    const prefer = (MAP_PREF === 'auto') ? provider : MAP_PREF;
    if (prefer === 'apple') {
      const u = new URL('https://maps.apple.com/'); u.searchParams.set('ll', `${lat},${lon}`); return u.href;
    }
    if (prefer === 'google') {
      const u = new URL('https://www.google.com/maps'); u.searchParams.set('q', `${lat},${lon}`); return u.href;
    }
    if (prefer === 'osm') {
      const u = new URL('https://www.openstreetmap.org/'); u.hash = `#map=${MAP_ZOOM}/${lat}/${lon}`;
      u.searchParams.set('mlat', lat); u.searchParams.set('mlon', lon); return u.href;
    }
    return href;
  };

  // -------- Banner builder --------
  const staticOSM = (lat, lon) => {
    const size = '1200x' + Math.max(120, MAP_HEIGHT);
    const src = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${MAP_ZOOM}&size=${size}&maptype=mapnik&markers=${lat},${lon},lightblue1`;
    const wrap = document.createElement('a');
    wrap.className = `${WRAP_CLASS}`;
    wrap.target = '_blank'; wrap.rel = 'noopener';
    const inner = document.createElement('div'); inner.className = `${WRAP_CLASS}__inner`;
    const img = document.createElement('img');
    img.className = `${WRAP_CLASS}__img`; img.src = src; img.alt = 'Map preview'; img.loading = 'lazy';
    inner.appendChild(img);
    const att = document.createElement('span');
    att.className = `${WRAP_CLASS}__attribution`; att.textContent = '© OpenStreetMap contributors';
    inner.appendChild(att);
    wrap.appendChild(inner);
    return wrap;
  };

  // -------- Mount --------
  const mount = () => {
    ensureStyle();
    document.querySelectorAll(`.${WRAP_CLASS}, .${LINK_CLASS}`).forEach(n => n.remove());

    const raw = readMapLink(document);
    if (!raw) return;
    const info = normalizeMap(raw); if (!info) return;
    const outHref = formatOutLink(info);

    let bannerInserted = false;
    if (MAP_BANNER && info.lat != null && info.lon != null) {
      const banner = staticOSM(info.lat, info.lon);
      banner.href = outHref;
      insertBanner(banner);
      bannerInserted = true;
    }

    if (!bannerInserted || MAP_LINK_WITH_BANNER) {
      const link = document.createElement('a');
      link.className = LINK_CLASS;
      link.href = outHref; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = 'Open in Maps';
      insertLink(link);
    }
  };

  // -------- Boot --------
  const haveFrontmatter = () => qFrontmatterNodes(document).length > 0;
  const waitForFrontmatter = (cb) => {
    if (haveFrontmatter()) { cb(); return; }
    const obs = new MutationObserver(() => { if (haveFrontmatter()) { obs.disconnect(); cb(); } });
    obs.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => { if (haveFrontmatter()) { obs.disconnect(); cb(); } }, 2000);
  };
  const debounced = (fn, ms=100) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
  const boot = () => {
    waitForFrontmatter(mount);
    let lastPath = location.pathname;
    setInterval(() => { if (location.pathname !== lastPath) { lastPath = location.pathname; waitForFrontmatter(mount); } }, 150);
    const obs = new MutationObserver(debounced(() => waitForFrontmatter(mount), 120));
    obs.observe(getContainer() || document.body, { childList:true, subtree:true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();