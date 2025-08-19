/**
 * Obsidian Publish — Replace left-column site logo image with a simple OSM map
 * - Detaches map from H1 entirely
 * - No gradients, no blur, no date/location text
 * - Loads only when viewport is wide enough for sidebar (>= 750px)
 * - If narrow, restores the logo image
 *
 * Frontmatter fields (priority):
 *   1) lat + lng
 *   2) location: [lat, lng]  (single-line array or inline string)
 *   3) map_link: Apple/Google/OSM URL with coords
 */

(() => {
  const STYLE_ID   = 'side-map-style';
  const WRAP_ID    = 'side-map-wrap';
  const IFRAME_ID  = 'side-map-iframe';
  const MIN_VW     = 750;                       // only render map at/above this width
  const MAP_ZOOM   = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.SIDE_MAP_HEIGHT) ? window.SIDE_MAP_HEIGHT : 140;

  // ---------- DOM helpers ----------
  const getLogoImg = () =>
    document.querySelector('.site-body-left-column-site-logo img');

  const getLogoBox = () =>
    document.querySelector('.site-body-left-column-site-logo');

  const getContainer = () =>
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
        for (const tr of n.querySelectorAll('tr')) {
          const k = tr.querySelector('th, td:first-child');
          const v = tr.querySelector('td:last-child');
          if (k && v) out += `${k.textContent.trim()}: ${v.textContent.trim()}\n`;
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

  const readMapLink = () => readFMField('map_link');

  // ---------- URL/coords ----------
  const toFloat = (s)=>{const n=parseFloat(String(s).trim());return Number.isFinite(n)?n:null;};
  const pair = (s)=>{ if(!s) return null; const m=String(s).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); if(!m) return null; const lat=toFloat(m[1]), lon=toFloat(m[2]); return (lat==null||lon==null)?null:{lat,lon}; };
  const qobj = (u)=>{const o=Object.create(null); for (const [k,v] of u.searchParams.entries()) o[k]=v; return o;};

  // Read coordinates directly from FM: lat/lng or location:[lat, lng]
  const readCoordsFromFM = () => {
    // 1) Separate lat/lng keys
    const latStr = readFMField('lat');
    const lngStr = readFMField('lng'); // explicitly "lng"
    const lat = toFloat(latStr);
    const lon = toFloat(lngStr);
    if (lat != null && lon != null) return { lat, lon };

    // 2) Single "location: [lat, lng]" line
    const fmText = getFMPlainText();
    const m = fmText.match(/^\s*location\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*$/mi);
    if (m) {
      const a = toFloat(m[1]), b = toFloat(m[2]);
      if (a != null && b != null) return { lat: a, lon: b };
    }
    // table/inline cell containing array-like string
    const locInline = readFMField('location');
    const p = pair(locInline);
    if (p) return p;

    return null;
  };

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

  // basic bbox for OSM embed
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
      }
      #${WRAP_ID}{
        position:relative;
        width:100%;
        height:var(--side-map-h);
        border-radius: var(--radius-s, 6px);
        overflow:hidden;
        background: var(--background-primary, transparent);
      }
      #${IFRAME_ID}{
        position:absolute; inset:0;
        width:100%; height:100%;
        border:0; display:block;
        padding-right:18px;
      }
    `;
    const el=document.createElement('style');
    el.id=STYLE_ID; el.textContent=css;
    document.head.appendChild(el);
  };

  // ---------- mount/unmount ----------
  const mountSideMap = (lat, lon) => {
    const box = getLogoBox();
    const img = getLogoImg();
    if (!box || !img) return;

    if (document.getElementById(WRAP_ID)) return; // already mounted

    const wrap = document.createElement('div');
    wrap.id = WRAP_ID;

    const ifr = document.createElement('iframe');
    ifr.id = IFRAME_ID;
    ifr.src = osmEmbedUrl(lat, lon, MAP_ZOOM);
    ifr.referrerPolicy = 'no-referrer-when-downgrade';
    ifr.loading = 'lazy';

    wrap.appendChild(ifr);

    // Insert map and hide the logo img to save resources
    img.style.display = 'none';
    box.appendChild(wrap);
  };

  const unmountSideMap = () => {
    const wrap = document.getElementById(WRAP_ID);
    const img = getLogoImg();
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    if (img) img.style.removeProperty('display'); // show logo again
  };

  const shouldShowMap = () => window.innerWidth >= MIN_VW;

  let installing = false;
  const installIfReady = () => {
    if (installing) return;
    installing = true;

    ensureStyle();

    // === NEW PRIORITY ORDER: lat/lng → location → map_link ===
    let coords = readCoordsFromFM();
    if (!coords) {
      const raw = readMapLink();
      const info = raw && normalizeMap(raw);
      if (info && info.lat != null && info.lon != null) {
        coords = { lat: info.lat, lon: info.lon };
      }
    }

    const box = getLogoBox();
    const img = getLogoImg();

    if (!box || !img || !coords || !shouldShowMap()) {
      unmountSideMap();
      installing = false;
      return;
    }

    mountSideMap(coords.lat, coords.lon);
    installing = false;
  };

  const debounced = (fn, ms=120) => { let t; return () => { clearTimeout(t); t=setTimeout(fn, ms); }; };

  const boot = () => {
    // initial try, wait for frontmatter & logo to exist
    const haveFM = () => qFM(document).length > 0;
    const waitFM = (cb) => {
      if (haveFM()) { cb(); return; }
      const mo = new MutationObserver(() => { if (haveFM()) { mo.disconnect(); cb(); } });
      mo.observe(document.documentElement, { childList:true, subtree:true });
      setTimeout(() => { if (haveFM()) { mo.disconnect(); cb(); } }, 2000);
    };
    waitFM(installIfReady);

    // react to SPA path changes
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        waitFM(installIfReady);
      }
    }, 150);

    // react to DOM changes (e.g., sidebar render)
    const mo = new MutationObserver(debounced(installIfReady, 120));
    mo.observe(getContainer() || document.body, { childList:true, subtree:true });

    // react to viewport changes
    window.addEventListener('resize', debounced(installIfReady, 120), { passive:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();