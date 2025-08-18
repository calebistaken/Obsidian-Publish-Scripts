/**
 * Obsidian Publish — Right sidebar OSM map (above graph view)
 * - Inserts a simple OSM iframe inside `.site-body-right-column-inner`,
 *   immediately above `.graph-view-outer` (or at the end if graph is absent).
 * - No gradients/blur; dark theme uses a gentle filter to reduce glare.
 * - Inline metadata below the map: "<Place, Country> • <date>".
 * - Loads only for wide viewports (>= 750px) to save resources.
 *
 * Frontmatter fields used:
 *   map_link: Apple/Google/OSM URL with coordinates (required to render map)
 *   address : comma-separated string; we render "first, last-non-zip"
 *   date    : string; rendered inline after a " • "
 *
 * Optional globals:
 *   window.MAP_ZOOM         (default 12)
 *   window.SIDE_MAP_HEIGHT  (default 140 px)
 *   window.SIDE_MAP_MIN_VW  (default 750)
 */

(() => {
  const STYLE_ID  = 'side-map-style';
  const BLOCK_ID  = 'side-map-block';
  const WRAP_ID   = 'side-map-wrap';
  const IFRAME_ID = 'side-map-iframe';
  const META_ID   = 'side-map-meta';

  const MAP_ZOOM   = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.SIDE_MAP_HEIGHT) ? window.SIDE_MAP_HEIGHT : 140;
  const MIN_VW     = Number.isFinite(window.SIDE_MAP_MIN_VW) ? window.SIDE_MAP_MIN_VW : 750;

  // ---------- DOM helpers ----------
  const getRightInner = () =>
    document.querySelector('.site-body-right-column-inner');

  const getGraphOuter = () =>
    document.querySelector('.site-body-right-column-inner .graph-view-outer');

  const getContentContainer = () =>
    document.querySelector('#content') ||
    document.querySelector('.markdown-preview-view') ||
    document.querySelector('.markdown-preview-section') ||
    document.body;

  // ---------- frontmatter helpers ----------
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

  const readFMField = (fieldName) => {
    const nodes=qFM(document);
    // table-style
    for (const n of nodes) {
      if (n.tagName==='TABLE'){
        for (const tr of n.querySelectorAll('tr')) {
          const k=tr.querySelector('th, td:first-child');
          const v=tr.querySelector('td:last-child');
          if (k && v && k.textContent.trim()===fieldName) {
            return v.textContent.trim().replace(/^["']|["']$/g,'');
          }
        }
      }
    }
    // prism/raw
    const rx = new RegExp(`^\\s*${fieldName}\\s*:\\s*["']?(.+?)["']?\\s*$`, 'mi');
    for (const n of nodes) {
      if (n.tagName==='TABLE') continue;
      const txt=(n.innerText||n.textContent||'').replace(/&amp;/g,'&');
      const m=txt.match(rx);
      if (m) return m[1].trim();
    }
    return null;
  };

  const readMapLink = () => readFMField('map_link');
  const readDateStr = () => readFMField('date');
  const readAddressStr = () => readFMField('address');

  // address → "first, last-non-zip"
  const formatLocationFromAddress = (addr) => {
    if (!addr) return null;
    const parts = String(addr).split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    const isZip = (s) => /\b\d{5}(?:-\d{4})?\b/.test(s);
    const first = parts[0];
    let last = null;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!isZip(parts[i])) { last = parts[i]; break; }
    }
    if (!last) last = parts[parts.length - 1];
    return `${first}, ${last}`;
  };

  // ---------- URL/coords ----------
  const toFloat = (s)=>{const n=parseFloat(String(s).trim());return Number.isFinite(n)?n:null;};
  const pair = (s)=>{ if(!s) return null; const m=String(s).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); if(!m) return null; const lat=toFloat(m[1]), lon=toFloat(m[2]); return (lat==null||lon==null)?null:{lat,lon}; };
  const qobj = (u)=>{const o=Object.create(null); for (const [k,v] of u.searchParams.entries()) o[k]=v; return o;};

  const normalizeMap = (raw) => {
    let href=(raw||'').replace(/&amp;/g,'&').trim();
    if (!/^https?:\/\//i.test(href)) return null;
    let u; try { u=new URL(href); } catch { return null; }
    const host=u.hostname.toLowerCase();

    if (host.endsWith('maps.apple.com')){
      const q=qobj(u); const c=pair(q.ll||q.sll)||pair(q.q);
      return {provider:'apple', href:u.href, ...(c||{})};
    }
    if (host.includes('google.') && u.pathname.toLowerCase().includes('/maps')){
      const at=u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const q=qobj(u);
      const c=(at && {lat:toFloat(at[1]), lon:toFloat(at[2])}) || pair(q.q) || pair(q.query);
      return {provider:'google', href:u.href, ...(c||{})};
    }
    if (host.includes('openstreetmap.org')){
      const q=qobj(u);
      let lat=toFloat(q.mlat), lon=toFloat(q.mlon);
      if (lat==null||lon==null){
        const m=(u.hash||'').match(/map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
        if (m){ lat=toFloat(m[1]); lon=toFloat(m[2]); }
      }
      return {provider:'osm', href:u.href, lat, lon};
    }
    return {provider:'unknown', href:u.href, lat:null, lon:null};
  };

  // Simple bbox for OSM embed
  const bboxFor = (lat, lon, zoom, pxW=300, pxH=MAP_HEIGHT) => {
    const mpp = 156543.03392 * Math.cos(lat * Math.PI/180) / Math.pow(2, zoom);
    const halfWm = (pxW * mpp) / 2, halfHm = (pxH * mpp) / 2;
    const latDegPerM = 1 / 111320;
    const lonDegPerM = 1 / (111320 * Math.cos(lat * Math.PI/180));
    return {
      left:   lon - halfWm * lonDegPerM,
      right:  lon + halfWm * lonDegPerM,
      top:    lat + halfHm * latDegPerM,
      bottom: lat - halfHm * latDegPerM
    };
  };

  const osmEmbedUrl = (lat, lon, zoom) => {
    const { left, right, top, bottom } = bboxFor(lat, lon, zoom);
    const u = new URL('https://www.openstreetmap.org/export/embed.html');
    u.searchParams.set('bbox', `${left},${bottom},${right},${top}`);
    u.searchParams.set('layer', 'mapnik');
    u.searchParams.set('marker', `${lat},${lon}`);
    return u.href;
  };

  // ---------- styles ----------
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      :root{
        --side-map-h: ${MAP_HEIGHT}px;
        --side-map-gap: var(--size-4-2, .5rem);
        --side-map-radius: var(--radius-s, 6px);
        --side-map-bg: var(--background-primary, transparent);

        /* Theme-aware filtering: none for light; soften for dark */
        --side-map-filter: none;
      }
      body.theme-dark{
        --side-map-filter: brightness(.78) contrast(1.05) saturate(.9);
      }

      /* Whole block (map + meta) */
      #${BLOCK_ID}{
        display:block;
        margin: 0 0 var(--side-map-gap) 0;
      }

      #${WRAP_ID}{
        position:relative;
        width:100%;
        height:var(--side-map-h);
        border-radius: var(--side-map-radius);
        overflow:hidden;
        background: var(--side-map-bg);
      }
      #${IFRAME_ID}{
        position:absolute; inset:0;
        width:100%; height:100%;
        border:0; display:block;
        filter: var(--side-map-filter);
      }

      /* Inline meta below map */
      #${META_ID}{
        margin-top: .35rem;
        font-size: var(--font-small, .85rem);
        color: var(--text-muted, inherit);
        display:flex;
        align-items:center;
        gap: .4rem;
        line-height: 1.25;
        white-space: normal;
        word-break: break-word;
      }
      #${META_ID} .place{ }
      #${META_ID} .sep{ opacity:.65; }
      #${META_ID} .date{ }
    `;
    const el=document.createElement('style');
    el.id=STYLE_ID; el.textContent=css;
    document.head.appendChild(el);
  };

  // ---------- mount/unmount ----------
  const buildBlock = (lat, lon, metaText) => {
    const block = document.createElement('div');
    block.id = BLOCK_ID;

    const wrap  = document.createElement('div');
    wrap.id = WRAP_ID;

    const ifr   = document.createElement('iframe');
    ifr.id = IFRAME_ID;
    ifr.src = osmEmbedUrl(lat, lon, MAP_ZOOM);
    ifr.referrerPolicy = 'no-referrer-when-downgrade';
    ifr.loading = 'lazy';

    wrap.appendChild(ifr);
    block.appendChild(wrap);

    const meta = document.createElement('div');
    meta.id = META_ID;
    meta.innerHTML = metaText || '';
    block.appendChild(meta);

    return block;
  };

  const mountSideMap = (lat, lon, locationText, dateStr) => {
    const right = getRightInner();
    if (!right) return;

    if (document.getElementById(BLOCK_ID)) return; // already mounted

    const pieces = [];
    if (locationText) pieces.push(`<span class="place">${locationText}</span>`);
    if (locationText && dateStr) pieces.push(`<span class="sep">•</span>`);
    if (dateStr) pieces.push(`<span class="date">${String(dateStr)}</span>`);
    const metaHTML = pieces.join(' ');

    const block = buildBlock(lat, lon, metaHTML);

    const graph = getGraphOuter();
    if (graph && graph.parentNode === right) {
      right.insertBefore(block, graph);
    } else {
      right.appendChild(block);
    }
  };

  const unmountSideMap = () => {
    const block = document.getElementById(BLOCK_ID);
    if (block && block.parentNode) block.parentNode.removeChild(block);
  };

  const shouldShowMap = () => window.innerWidth >= MIN_VW;

  let installing = false;
  const installIfReady = () => {
    if (installing) return;
    installing = true;

    ensureStyle();

    const raw = readMapLink();
    const info = raw && normalizeMap(raw);

    if (!info || info.lat==null || info.lon==null || !shouldShowMap()) {
      unmountSideMap();
      installing = false;
      return;
    }

    const dateStr = readDateStr();
    const addrStr = readAddressStr();
    const locTxt  = formatLocationFromAddress(addrStr);

    mountSideMap(info.lat, info.lon, locTxt, dateStr);
    installing = false;
  };

  const debounced = (fn, ms=120) => { let t; return () => { clearTimeout(t); t=setTimeout(fn, ms); }; };

  const haveFM = () => qFM(document).length > 0;
  const waitFM = (cb) => {
    if (haveFM()) { cb(); return; }
    const mo = new MutationObserver(() => { if (haveFM()) { mo.disconnect(); cb(); } });
    mo.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => { if (haveFM()) { mo.disconnect(); cb(); } }, 2000);
  };

  const boot = () => {
    waitFM(installIfReady);

    // react to SPA path changes
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        waitFM(installIfReady);
      }
    }, 150);

    // react to DOM mutations (right column may mount late)
    const mo = new MutationObserver(debounced(installIfReady, 120));
    mo.observe(getContentContainer() || document.body, { childList:true, subtree:true });

    // react to viewport changes
    window.addEventListener('resize', debounced(installIfReady, 120), { passive:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();