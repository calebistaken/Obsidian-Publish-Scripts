/**
 * Obsidian Publish — Right sidebar OSM map (above graph view)
 * - Inserts a simple OSM iframe inside `.site-body-right-column-inner`,
 *   immediately above `.graph-view-outer` (or at the end if graph is absent).
 * - No gradients/blur; dark theme uses a gentle filter to reduce glare.
 * - Inline metadata below the map: "<Place, Country> • <date>".
 * - Loads only for wide viewports (>= 750px) to save resources.
 *
 * Frontmatter fields used (in priority order):
 *   1) lat / lng : numbers
 *   2) location  : [lat, lng] (single-line YAML array)
 *   3) map_view_link : "[](geo:<a>,<b>)"  // <a>,<b> in same order as `location:` (lat,lng),
 *                                         // but we auto-detect and swap if needed
 *   4) map_link  : Apple/Google/OSM URL with coordinates
 *   address : comma-separated string; we render "first, last-non-zip"
 *   date    : string; rendered inline after a " • "
 *
 * Optional globals:
 *   window.MAP_ZOOM         (default 12)
 *   window.SIDE_MAP_HEIGHT  (default 400 px)
 *   window.SIDE_MAP_MIN_VW  (default 0)
 */

(() => {
  const STYLE_ID  = 'side-map-style';
  const BLOCK_ID  = 'side-map-block';
  const WRAP_ID   = 'side-map-wrap';
  const IFRAME_ID = 'side-map-iframe';
  const META_ID   = 'side-map-meta';

  const MAP_ZOOM   = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.SIDE_MAP_HEIGHT) ? window.SIDE_MAP_HEIGHT : 400;
  const MIN_VW     = Number.isFinite(window.SIDE_MAP_MIN_VW) ? window.SIDE_MAP_MIN_VW : 0;

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

  const getFMPlainText = () => {
    const nodes = qFM(document);
    let out = '';
    for (const n of nodes) {
      if (n.tagName === 'TABLE') {
        // flatten table key/value rows to "key: value" lines
        for (const tr of n.querySelectorAll('tr')) {
          const k = tr.querySelector('th, td:first-child');
          const v = tr.querySelector('td:last-child');
          if (k && v) {
            out += `${k.textContent.trim()}: ${v.textContent.trim()}\n`;
          }
        }
      } else {
        out += (n.innerText || n.textContent || '') + '\n';
      }
    }
    return out.replace(/&amp;/g, '&');
  };

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

  const readMapLink      = () => readFMField('map_link');
  const readMapViewLink  = () => readFMField('map_view_link');
  const readDateStr      = () => readFMField('date');
  const readAddressStr   = () => readFMField('address');

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
  const pair = (s)=>{ if(!s) return null; const m=String(s).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); if(!m) return null; const a=toFloat(m[1]), b=toFloat(m[2]); return (a==null||b==null)?null:{a,b}; };
  const qobj = (u)=>{const o=Object.create(null); for (const [k,v] of u.searchParams.entries()) o[k]=v; return o;};

  // normalize to {lat, lon} and auto-swap if obviously reversed
  const toLatLon = (a, b) => {
    // prefer [lat, lon] (like your `location:` array)
    let lat = a, lon = b;
    const inLat = (x) => x != null && Math.abs(x) <= 90;
    const inLon = (x) => x != null && Math.abs(x) <= 180;
    if (!inLat(lat) || !inLon(lon)) {
      // try swapped
      if (inLat(b) && inLon(a)) { lat = b; lon = a; }
    }
    return (inLat(lat) && inLon(lon)) ? { lat, lon } : null;
  };

  // NEW: parse "[](geo:...)" from map_view_link
  const parseGeoMarkdownLink = (raw) => {
    if (!raw) return null;
    // Accept things like: "[](geo:31.2304667,121.4579532)" or with spaces/quotes
    const m = String(raw).match(/\]\(\s*geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i);
    if (!m) return null;
    const a = toFloat(m[1]), b = toFloat(m[2]);
    return toLatLon(a, b);
  };

  // read coordinates directly from frontmatter, by priority
  const readCoordsFromFM = () => {
    // 1) Separate lat/lng keys
    const latStr = readFMField('lat');
    const lngStr = readFMField('lng'); // user explicitly asked for "lng"
    const lat = toFloat(latStr);
    const lon = toFloat(lngStr);
    if (lat != null && lon != null) return { lat, lon };

    // 2) Single "location: [lat, lng]" line (or reversed; we’ll correct if needed)
    const fmText = getFMPlainText();
    const m = fmText.match(/^\s*location\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*$/mi);
    if (m) {
      const a = toFloat(m[1]), b = toFloat(m[2]);
      const t = toLatLon(a, b);
      if (t) return t;
    }

    // 3) If table rendered "location" cell contains "[.., ..]"
    const locInline = readFMField('location');
    const p = pair(locInline);
    if (p) {
      const t = toLatLon(p.a, p.b);
      if (t) return t;
    }

    // 4) NEW: map_view_link: "[](geo:<a>,<b>)"
    const mvl = readMapViewLink();
    const g = parseGeoMarkdownLink(mvl);
    if (g) return g;

    return null;
  };

  const normalizeMap = (raw) => {
    let href=(raw||'').replace(/&amp;/g,'&').trim();
    if (!/^https?:\/\//i.test(href)) return null;
    let u; try { u=new URL(href); } catch { return null; }
    const host=u.hostname.toLowerCase();

    if (host.endsWith('maps.apple.com')){
      const q=qobj(u); const c=pair(q.ll||q.sll)||pair(q.q);
      if (c) { const t = toLatLon(c.a, c.b); return {provider:'apple', href:u.href, ...(t||{})}; }
      return {provider:'apple', href:u.href, lat:null, lon:null};
    }
    if (host.includes('google.') && u.pathname.toLowerCase().includes('/maps')){
      const at=u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const q=qobj(u);
      let t=null;
      if (at) t = toLatLon(toFloat(at[1]), toFloat(at[2]));
      if (!t) {
        const pq = pair(q.q) || pair(q.query);
        if (pq) t = toLatLon(pq.a, pq.b);
      }
      return {provider:'google', href:u.href, ...(t||{})};
    }
    if (host.includes('openstreetmap.org')){
      const q=qobj(u);
      let lat=toFloat(q.mlat), lon=toFloat(q.mlon);
      if (lat==null||lon==null){
        const m=(u.hash||'').match(/map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
        if (m){ const t = toLatLon(toFloat(m[1]), toFloat(m[2])); if (t){lat=t.lat; lon=t.lon;} }
      }
      return {provider:'osm', href:u.href, lat, lon};
    }
    return {provider:'unknown', href:u.href, lat:null, lon:null};
  };

  // Safer bbox with a little padding so the marker never falls outside
  const bboxFor = (lat, lon, zoom, pxW, pxH) => {
    const mpp = 156543.03392 * Math.cos(lat * Math.PI/180) / Math.pow(2, zoom);
    const halfWm = (pxW * mpp) / 2, halfHm = (pxH * mpp) / 2;
    const pad = 1.15; // 15% extra breathing room
    const latDegPerM = 1 / 111320;
    const lonDegPerM = 1 / (111320 * Math.cos(lat * Math.PI/180));
    return {
      left:   lon - (halfWm * lonDegPerM * pad),
      right:  lon + (halfWm * lonDegPerM * pad),
      top:    lat + (halfHm * latDegPerM * pad),
      bottom: lat - (halfHm * latDegPerM * pad),
    };
  };

  const osmEmbedUrl = (lat, lon, zoom) => {
    // Try to size bbox to the actual rendered box for better framing
    const wrap = document.getElementById('side-map-wrap');
    const pxW = Math.max(240, (wrap?.clientWidth || 300));
    const pxH = Math.max(240, (wrap?.clientHeight || 400));

    const { left, right, top, bottom } = bboxFor(lat, lon, zoom, pxW, pxH);

    const u = new URL('https://www.openstreetmap.org/export/embed.html');
    u.searchParams.set('layer', 'mapnik');
    u.searchParams.set('bbox', `${left},${bottom},${right},${top}`);
    u.searchParams.set('marker', `${lat},${lon}`);

    // Belt-and-suspenders: hash also carries the zoom/center for the embed
    return `${u.href}#map=${zoom}/${lat}/${lon}`;
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
        --side-map-filter: none;
      }
      body.theme-dark{
        --side-map-filter: brightness(.78) contrast(1.05) saturate(.9);
      }
      .site-body-right-column { padding-top: 32px; }

      #${BLOCK_ID}{ display:block; margin: 0 0 var(--side-map-gap) 0; }

      #${WRAP_ID}{
        position:relative; width:100%;
        aspect-ratio: 1 / 1;
        max-height:var(--side-map-h);
        border-radius: var(--side-map-radius);
        overflow:hidden; background: var(--side-map-bg);
      }
      #${IFRAME_ID}{
        position:absolute; inset:0; width:100%; height:100%;
        border:0; display:block; filter: var(--side-map-filter);
      }

      #${META_ID}{
        margin-top: .35rem;
        font-size: var(--font-small, .85rem);
        color: var(--text-muted);
        font-family: var(--font-caption-theme), var(--font-monospace-theme), san-serif;
        text-align: center;

        display: inline-block;   /* shrink-wraps text */
        line-height: 1.25;
        white-space: normal;
        word-break: break-word;
      }

      #${META_ID} .place,
      #${META_ID} .sep,
      #${META_ID} .date {
        display: inline;         /* all inline on same line */
      }
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
    if (locationText && dateStr) pieces.push(`<span class="sep"> • </span>`);
    if (dateStr) pieces.push(`<span class="date">${String(dateStr)}</span>`);
    const metaHTML = pieces.join('');    const block = buildBlock(lat, lon, metaHTML);

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

    // === PRIORITY ORDER: lat/lng → location → map_view_link → map_link ===
    let coords = readCoordsFromFM();

    if (!coords) {
      // fallback to generic map_link
      const raw = readMapLink();
      const info = raw && normalizeMap(raw);
      if (info && info.lat != null && info.lon != null) {
        coords = { lat: info.lat, lon: info.lon };
      }
    }

    if (!coords || !shouldShowMap()) {
      unmountSideMap();
      installing = false;
      return;
    }

    const dateStr = readDateStr();
    const addrStr = readAddressStr();
    const locTxt  = formatLocationFromAddress(addrStr);

    mountSideMap(coords.lat, coords.lon, locTxt, dateStr);
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