/**
 * Obsidian Publish — Location Chip (reads map_link, no iframes/images)
 * - Parses `map_link` (and optional `address`) from rendered frontmatter
 * - Builds a small pill "📍 <address>" under the H1
 * - Opens Apple/Google/OSM based on MAP_PREF (or the original link)
 *
 * Optional globals (define before this script if you want):
 *   window.MAP_CHIP = true                 // enable chip (default true)
 *   window.MAP_PREF = 'auto'|'apple'|'google'|'osm'  // click-through target (default 'auto')
 *   window.MAP_CLICK_NEW_TAB = true        // open in new tab (default true)
 *   window.MAP_CHIP_POSITION = 'below'|'above'  // place relative to H1 (default 'below')
 *   window.MAP_CHIP_EMOJI = '📍'           // leading symbol (default 📍)
 *   window.MAP_CHIP_FALLBACK = 'Open in Maps' // text when no address (default)
 *   window.MAP_DEBUG = false
 */
(() => {
  // ------- config -------
  const MAP_CHIP = typeof window.MAP_CHIP === 'boolean' ? window.MAP_CHIP : true;
  const MAP_PREF = typeof window.MAP_PREF === 'string' ? window.MAP_PREF : 'auto';
  const MAP_CLICK_NEW_TAB = (typeof window.MAP_CLICK_NEW_TAB === 'boolean') ? window.MAP_CLICK_NEW_TAB : true;
  const MAP_CHIP_POSITION = (window.MAP_CHIP_POSITION === 'above') ? 'above' : 'below';
  const MAP_CHIP_EMOJI = (typeof window.MAP_CHIP_EMOJI === 'string') ? window.MAP_CHIP_EMOJI : '📍';
  const MAP_CHIP_FALLBACK = (typeof window.MAP_CHIP_FALLBACK === 'string') ? window.MAP_CHIP_FALLBACK : 'Open in Maps';
  const MAP_DEBUG = !!window.MAP_DEBUG;
  const log = (...a)=> MAP_DEBUG && console.log('[map-chip]', ...a);

  const STYLE_ID = 'map-chip-style';
  const CHIP_ID  = 'map-chip';

  // ------- styles (theme-aware via body.theme-*) -------
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #${CHIP_ID}{
        display:inline-flex; align-items:center; gap:.4ch;
        padding:.22rem .55rem; border-radius:999px;
        font: inherit; font-size:.95em; line-height:1.1;
        text-decoration:none;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        user-select: none;
        border: 1px solid transparent;
      }
      body.theme-light #${CHIP_ID}{
        color:#0b3d2e; background:#e9f6f1; border-color:#ccebe1;
      }
      body.theme-dark #${CHIP_ID}{
        color:#d9fff4; background:#0f2a24; border-color:#17443a;
      }
      #${CHIP_ID}:hover{ filter: brightness(1.03); }
      #${CHIP_ID}:focus{ outline:2px solid currentColor; outline-offset:2px; }
      /* spacing around the chip */
      .map-chip-wrap{ margin:.5rem 0 .85rem 0; }
    `;
    const el = document.createElement('style');
    el.id = STYLE_ID; el.textContent = css;
    document.head.appendChild(el);
  };

  // ------- DOM helpers -------
  const getContainer = () =>
    document.querySelector('#content') ||
    document.querySelector('.markdown-preview-view') ||
    document.querySelector('.markdown-preview-section') ||
    document.body;
  const getH1 = () =>
    document.querySelector('.markdown-preview-view h1, #content h1, .view-content h1, h1');

  const placeChip = (chip) => {
    const h1 = getH1();
    const container = getContainer();
    if (!h1) { container.prepend(chip); return; }
    const wrap = document.createElement('div');
    wrap.className = 'map-chip-wrap';
    wrap.appendChild(chip);
    if (MAP_CHIP_POSITION === 'above') h1.parentNode.insertBefore(wrap, h1);
    else h1.parentNode.insertBefore(wrap, h1.nextSibling);
  };

  // ------- frontmatter parsing (map_link + address) -------
  const qFM = (root=document) => root.querySelectorAll([
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

  const readFields = (keys) => {
    const out = Object.create(null);
    const nodes = qFM(document);
    const asText = (n) => (n.innerText || n.textContent || '').replace(/&amp;/g,'&');
    // Table layout
    for (const n of nodes) {
      if (n.tagName === 'TABLE') {
        for (const tr of n.querySelectorAll('tr')) {
          const k = tr.querySelector('th, td:first-child');
          const v = tr.querySelector('td:last-child');
          if (!k || !v) continue;
          const key = k.textContent.trim();
          if (keys.includes(key) && out[key] == null) out[key] = v.textContent.trim().replace(/^["']|["']$/g,'');
        }
      }
    }
    // Prism tokens or raw text
    for (const n of nodes) {
      if (n.tagName === 'TABLE') continue;
      const txt = asText(n);
      for (const key of keys) {
        if (out[key] != null) continue;
        const m = txt.match(new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s*:\\s*["\']?(.+?)["\']?\\s*$', 'mi'));
        if (m) out[key] = m[1].trim();
      }
    }
    return out;
  };

  // ------- map URL normalize -------
  const toFloat = (s)=>{const n=parseFloat(String(s).trim()); return Number.isFinite(n)?n:null;};
  const pair = (s)=>{ if(!s) return null; const m=String(s).match(/(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)/); if(!m) return null; const lat=toFloat(m[1]), lon=toFloat(m[2]); return (lat==null||lon==null)?null:{lat,lon}; };
  const qobj = (u)=>{const o=Object.create(null); for (const [k,v] of u.searchParams.entries()) o[k]=v; return o;};

  const normalizeMap = (raw) => {
    let href=(raw||'').replace(/&amp;/g,'&').trim();
    if (!/^https?:\\/\\//i.test(href)) return null;
    let u; try { u=new URL(href); } catch { return null; }
    const host=u.hostname.toLowerCase();
    if (host.endsWith('maps.apple.com')){
      const q=qobj(u); const c=pair(q.ll||q.sll)||pair(q.q);
      return {provider:'apple', href:u.href, ...(c||{})};
    }
    if (host.includes('google.') && u.pathname.toLowerCase().includes('/maps')){
      const at=u.pathname.match(/@(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)/);
      const q=qobj(u);
      const c=(at && {lat:toFloat(at[1]), lon:toFloat(at[2])}) || pair(q.q) || pair(q.query);
      return {provider:'google', href:u.href, ...(c||{})};
    }
    if (host.includes('openstreetmap.org')){
      const q=qobj(u);
      let lat=toFloat(q.mlat), lon=toFloat(q.mlon);
      if (lat==null||lon==null){
        const m=(u.hash||'').match(/map=\\d+\\/(-?\\d+(?:\\.\\d+)?)\\/(-?\\d+(?:\\.\\d+)?)/);
        if (m){ lat=toFloat(m[1]); lon=toFloat(m[2]); }
      }
      return {provider:'osm', href:u.href, lat, lon};
    }
    return {provider:'unknown', href:u.href, lat:null, lon:null};
  };

  const formatOutLink = ({provider, href, lat, lon}) => {
    if (lat==null || lon==null) return href;
    const prefer = (MAP_PREF==='auto') ? provider : MAP_PREF;
    if (prefer==='apple'){ const u=new URL('https://maps.apple.com/'); u.searchParams.set('ll',`${lat},${lon}`); return u.href; }
    if (prefer==='google'){ const u=new URL('https://www.google.com/maps'); u.searchParams.set('q',`${lat},${lon}`); return u.href; }
    if (prefer==='osm'){ const u=new URL('https://www.openstreetmap.org/'); u.hash=`#map=14/${lat}/${lon}`; u.searchParams.set('mlat',lat); u.searchParams.set('mlon',lon); return u.href; }
    return href;
  };

  // ------- chip builder -------
  const buildChip = (href, label) => {
    const a = document.createElement('a');
    a.id = CHIP_ID;
    a.href = href;
    if (MAP_CLICK_NEW_TAB) { a.target = '_blank'; a.rel = 'noopener'; }
    a.setAttribute('aria-label', label ? `Open in maps: ${label}` : 'Open in maps');
    a.title = label ? label : 'Open in maps';
    a.textContent = `${MAP_CHIP_EMOJI} ${label || MAP_CHIP_FALLBACK}`;
    return a;
  };

  // ------- mount -------
  let mounting = false;
  const mount = () => {
    if (mounting) return; mounting = true;
    ensureStyle();
    // remove old chip (SPA dedupe)
    document.getElementById(CHIP_ID)?.parentElement?.remove();

    if (!MAP_CHIP) { mounting = false; return; }

    const { map_link, address } = readFields(['map_link', 'address']);
    if (!map_link) { log('no map_link'); mounting = false; return; }

    const info = normalizeMap(map_link);
    if (!info) { log('bad map_link'); mounting = false; return; }

    const href = formatOutLink(info);
    const label = (address && address.trim()) || null;
    placeChip(buildChip(href, label));

    mounting = false;
  };

  // ------- boot / SPA safety -------
  const haveFrontmatter = () => qFM(document).length > 0;
  const waitForFrontmatter = (cb) => {
    if (haveFrontmatter()) { cb(); return; }
    const mo = new MutationObserver(() => { if (haveFrontmatter()) { mo.disconnect(); cb(); } });
    mo.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => { if (haveFrontmatter()) { mo.disconnect(); cb(); } }, 2000);
  };

  const boot = () => {
    waitForFrontmatter(mount);

    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) { lastPath = location.pathname; waitForFrontmatter(mount); }
    }, 150);

    const mo = new MutationObserver(() => {
      if (!document.getElementById(CHIP_ID)) waitForFrontmatter(mount);
    });
    mo.observe(getContainer() || document.body, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();