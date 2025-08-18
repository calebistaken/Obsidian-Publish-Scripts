/**
 * Obsidian Publish — H1 over OSM iframe (stable, idempotent, 8px, date badge)
 * - Reuses wrapper if found (no flicker)
 * - Only unwraps when immediately re-wrapping
 * - Debounced remount on SPA mutations
 * - 8px radius, radial fade, theme-aware overlays, date badge
 *
 * Tuning (optional, define before this script):
 *   window.MAP_BANNER = true
 *   window.MAP_PREF   = 'auto'|'apple'|'google'|'osm'
 *   window.MAP_ZOOM   = 12
 *   window.MAP_HEIGHT = 140
 *   window.MAP_CLICK_NEW_TAB = true
 *   // make edge fade harder (smaller inner, larger soft):
 *   window.MAP_VIGNETTE_INNER = 0.52
 *   window.MAP_VIGNETTE_SOFT  = 0.30
 *   // quieting:
 *   window.MAP_OPACITY = 0.55; window.MAP_GRAYSCALE = 0.5; window.MAP_BLUR_PX = 1.5; window.MAP_BRIGHTNESS = 0.95;
 *   // overlays:
 *   window.MAP_OVERLAY_L  = 0.08; window.MAP_OVERLAY_L2 = 0.16;
 *   window.MAP_OVERLAY_D  = 0.20; window.MAP_OVERLAY_D2 = 0.38;
 *   // date:
 *   window.MAP_DATE_SHOW   = true;  window.MAP_DATE_FIELD  = 'date'; window.MAP_DATE_FORMAT = 'iso'|'locale';
 *   // debug:
 *   window.MAP_DEBUG = false
 */
(() => {
  // ----- config -----
  const MAP_BANNER = typeof window.MAP_BANNER === 'boolean' ? window.MAP_BANNER : true;
  const MAP_PREF   = typeof window.MAP_PREF === 'string' ? window.MAP_PREF : 'auto';
  const MAP_ZOOM   = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.MAP_HEIGHT) ? window.MAP_HEIGHT : 140;
  const MAP_CLICK_NEW_TAB = (typeof window.MAP_CLICK_NEW_TAB === 'boolean') ? window.MAP_CLICK_NEW_TAB : true;

  const MAP_OPACITY    = Number.isFinite(window.MAP_OPACITY)    ? window.MAP_OPACITY    : 0.55;
  const MAP_GRAYSCALE  = Number.isFinite(window.MAP_GRAYSCALE)  ? window.MAP_GRAYSCALE  : 0.5;
  const MAP_BLUR_PX    = Number.isFinite(window.MAP_BLUR_PX)    ? window.MAP_BLUR_PX    : 1.5;
  const MAP_BRIGHTNESS = Number.isFinite(window.MAP_BRIGHTNESS) ? window.MAP_BRIGHTNESS : 0.95;

  const VIGNETTE_INNER = Number.isFinite(window.MAP_VIGNETTE_INNER) ? window.MAP_VIGNETTE_INNER : 0.60;
  const VIGNETTE_SOFT  = Number.isFinite(window.MAP_VIGNETTE_SOFT)  ? window.MAP_VIGNETTE_SOFT  : 0.18;

  const OL_L  = Number.isFinite(window.MAP_OVERLAY_L)  ? window.MAP_OVERLAY_L  : 0.08;
  const OL_L2 = Number.isFinite(window.MAP_OVERLAY_L2) ? window.MAP_OVERLAY_L2 : 0.16;
  const OL_D  = Number.isFinite(window.MAP_OVERLAY_D)  ? window.MAP_OVERLAY_D  : 0.20;
  const OL_D2 = Number.isFinite(window.MAP_OVERLAY_D2) ? window.MAP_OVERLAY_D2 : 0.38;

  const MAP_DATE_SHOW   = (typeof window.MAP_DATE_SHOW === 'boolean') ? window.MAP_DATE_SHOW : true;
  const MAP_DATE_FIELD  = (typeof window.MAP_DATE_FIELD === 'string') ? window.MAP_DATE_FIELD : 'date';
  const MAP_DATE_FORMAT = (typeof window.MAP_DATE_FORMAT === 'string') ? window.MAP_DATE_FORMAT : 'iso';

  const MAP_DEBUG = !!window.MAP_DEBUG;
  const log = (...a)=> MAP_DEBUG && console.log('[h1-iframe-stable]', ...a);

  // ----- ids/classes -----
  const STYLE_ID  = 'h1-iframe-style';
  const WRAP_ID   = 'h1-map-wrap';
  const LAYER_ID  = 'h1-map-layer';
  const IFRAME_ID = 'h1-map-iframe';
  const H1_CLASS  = 'h1-map-hero';
  const DATE_ID   = 'h1-map-date';

  // ----- DOM helpers -----
  const getContainer = () =>
    document.querySelector('#content') ||
    document.querySelector('.markdown-preview-view') ||
    document.querySelector('.markdown-preview-section') ||
    document.body;
  const getH1 = () =>
    document.querySelector('.markdown-preview-view h1, #content h1, .view-content h1, h1');
  const bodyBg = () => getComputedStyle(document.body).backgroundColor || '#fff';

  // ----- styles -----
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const inner = Math.max(0, Math.min(1, VIGNETTE_INNER));
    const edge  = Math.min(1, inner + Math.max(0.01, Math.min(1, VIGNETTE_SOFT)));
    const css = `
      :root{
        --map-h:${MAP_HEIGHT}px;
        --map-opacity:${MAP_OPACITY};
        --map-gray:${MAP_GRAYSCALE};
        --map-blur:${MAP_BLUR_PX}px;
        --map-bright:${MAP_BRIGHTNESS};
        --fade-inner:${inner};
        --fade-edge:${edge};
        --map-radius: 8px;
      }
      #${WRAP_ID}{
        position:relative;width:100%;height:var(--map-h);
        margin:.5rem 0 .85rem 0;border-radius:var(--map-radius);
        overflow:hidden; background: var(--page-bg, transparent);
      }
      #${LAYER_ID}{
        position:absolute; inset:0; z-index:1; pointer-events:none; border-radius: var(--map-radius);
        -webkit-mask-image: radial-gradient(ellipse at 50% 55%,
          rgba(0,0,0,1) calc(var(--fade-inner) * 100%),
          rgba(0,0,0,0) calc(var(--fade-edge) * 100%));
        mask-image: radial-gradient(ellipse at 50% 55%,
          rgba(0,0,0,1) calc(var(--fade-inner) * 100%),
          rgba(0,0,0,0) calc(var(--fade-edge) * 100%));
      }
      #${IFRAME_ID}{
        position:absolute; inset:0; width:100%; height:100%; border:0; display:block;
        border-radius: var(--map-radius);
        filter: grayscale(var(--map-gray)) brightness(var(--map-bright)) blur(var(--map-blur));
        opacity: var(--map-opacity);
        transform: translateZ(0);
      }
      #${WRAP_ID}::after{
        content:""; position:absolute; inset:0; z-index:2; pointer-events:none; border-radius: var(--map-radius);
        background: linear-gradient(180deg, rgba(0,0,0,${OL_L}), rgba(0,0,0,${OL_L2}));
      }
      body.theme-dark #${WRAP_ID}::after{
        background: linear-gradient(180deg, rgba(0,0,0,${OL_D}), rgba(0,0,0,${OL_D2}));
      }
      .${H1_CLASS}{
        position:relative; z-index:3; margin:0; min-height:var(--map-h);
        display:flex; align-items:center; justify-content:center; text-align:center;
        border-radius: var(--map-radius);
        cursor:pointer; outline-offset:2px;
        text-shadow: 0 1px 3px rgba(0,0,0,.6);
      }
      .${H1_CLASS}[tabindex="0"]:focus{ outline:2px solid currentColor; }

      #${DATE_ID}{
        position:absolute; right:8px; bottom:6px; z-index:3; pointer-events:none;
        font: 500 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        padding: 4px 6px; border-radius: 6px; letter-spacing: .02em; opacity: .92;
      }
      body.theme-light #${DATE_ID}{ color:#083a2a; background:rgba(233,246,241,.85); border:1px solid rgba(204,235,225,.9); }
      body.theme-dark  #${DATE_ID}{ color:#d9fff4; background:rgba(15,42,36,.85);  border:1px solid rgba(23,68,58,.9);  }
      .note-nav{ position:relative; z-index:4; }
    `;
    const el = document.createElement('style');
    el.id = STYLE_ID; el.textContent = css;
    document.head.appendChild(el);
  };

  // ----- frontmatter parsing -----
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

  const readKey = (key) => {
    const nodes=qFM(document);
    // table layout
    for (const n of nodes) {
      if (n.tagName==='TABLE'){
        for (const tr of n.querySelectorAll('tr')) {
          const k=tr.querySelector('th, td:first-child');
          const v=tr.querySelector('td:last-child');
          if (k && v && k.textContent.trim()===key) {
            return v.textContent.trim().replace(/^["']|["']$/g,'');
          }
        }
      }
    }
    // prism/raw
    const re = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&') + '\\s*:\\s*(.+)$','mi');
    for (const n of nodes) {
      if (n.tagName==='TABLE') continue;
      const txt=(n.innerText||n.textContent||'').replace(/&amp;/g,'&');
      const m=txt.match(re);
      if (m) return m[1].trim().replace(/^["']|["']$/g,'');
    }
    return null;
  };

  const readMapLink = () => readKey('map_link');
  const readDateRaw = () => readKey(MAP_DATE_FIELD);

  // ----- url helpers -----
  const toFloat = (s)=>{const n=parseFloat(String(s).trim()); return Number.isFinite(n)?n:null;};
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

  const formatOutLink = ({provider, href, lat, lon}) => {
    if (lat==null || lon==null) return href;
    const prefer = (MAP_PREF==='auto') ? provider : MAP_PREF;
    if (prefer==='apple'){ const u=new URL('https://maps.apple.com/'); u.searchParams.set('ll',`${lat},${lon}`); return u.href; }
    if (prefer==='google'){ const u=new URL('https://www.google.com/maps'); u.searchParams.set('q',`${lat},${lon}`); return u.href; }
    if (prefer==='osm'){ const u=new URL('https://www.openstreetmap.org/'); u.hash=`#map=${MAP_ZOOM}/${lat}/${lon}`; u.searchParams.set('mlat',lat); u.searchParams.set('mlon',lon); return u.href; }
    return href;
  };

  // ----- OSM embed url -----
  const bboxFor = (lat, lon, zoom, pxW=1200, pxH=MAP_HEIGHT) => {
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

  // ----- date helpers -----
  const parseFrontmatterDate = (raw) => {
    if (!raw) return null;
    const arr = raw.match(/^\[\s*([^\]]+)\s*\]$/);
    let first = raw.trim();
    if (arr) {
      const parts = arr[1].split(',').map(s => s.trim().replace(/^["']|["']$/g,''));
      first = parts[0] || '';
    }
    const d = new Date(first);
    if (!isNaN(d.getTime())) {
      if (MAP_DATE_FORMAT === 'locale') {
        return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' });
      }
      const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    }
    const m2 = first.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : null;
  };

  // ----- idempotent build/update -----
  const ensureBanner = (embedSrc, outHref, dateText) => {
    const h1 = getH1(); if (!h1) { log('no h1'); return; }

    let wrap = document.getElementById(WRAP_ID);
    let layer, iframe, dateBadge;

    if (wrap) {
      // If H1 isn't inside, move it in (don’t delete anything)
      if (!wrap.contains(h1)) {
        h1.classList.add(H1_CLASS);
        wrap.insertBefore(h1, wrap.firstChild);
      }
      layer = document.getElementById(LAYER_ID) || (() => {
        const d=document.createElement('div'); d.id=LAYER_ID; wrap.appendChild(d); return d;
      })();
      iframe = document.getElementById(IFRAME_ID) || (() => {
        const f=document.createElement('iframe'); f.id=IFRAME_ID; f.referrerPolicy='no-referrer-when-downgrade'; f.loading='lazy'; layer.appendChild(f); return f;
      })();
      if (iframe.src !== embedSrc) iframe.src = embedSrc;
    } else {
      // Create fresh wrapper + layer + iframe and move H1 inside
      wrap = document.createElement('div');
      wrap.id = WRAP_ID;
      wrap.style.setProperty('--page-bg', bodyBg());
      const parent = h1.parentNode;
      parent.insertBefore(wrap, h1);
      wrap.appendChild(h1);
      h1.classList.add(H1_CLASS);

      layer = document.createElement('div');
      layer.id = LAYER_ID; wrap.appendChild(layer);

      iframe = document.createElement('iframe');
      iframe.id = IFRAME_ID; iframe.referrerPolicy = 'no-referrer-when-downgrade'; iframe.loading='lazy';
      iframe.src = embedSrc; layer.appendChild(iframe);
    }

    // H1 click wiring (idempotent)
    if (h1.dataset.mapHref !== outHref) {
      h1.dataset.mapHref = outHref;
      h1.dataset.mapBound = '1';
      h1.setAttribute('role','link'); h1.setAttribute('tabindex','0');
      const open = () => (MAP_CLICK_NEW_TAB ? window.open(outHref,'_blank','noopener') : location.href = outHref);
      h1.onclick = (e) => { if ((e.target instanceof Element) && e.target.closest('a')) return; open(); };
      h1.onkeydown = (e) => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); open(); } };
    }

    // Date badge (idempotent)
    if (dateText && MAP_DATE_SHOW) {
      dateBadge = document.getElementById(DATE_ID);
      if (!dateBadge) {
        dateBadge = document.createElement('div');
        dateBadge.id = DATE_ID;
        wrap.appendChild(dateBadge);
      }
      if (dateBadge.textContent !== dateText) dateBadge.textContent = dateText;
    } else {
      document.getElementById(DATE_ID)?.remove();
    }
  };

  // ----- compute + mount (debounced) -----
  let debounceTimer = null;
  const scheduleMount = () => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => { debounceTimer = null; mount(); }, 80);
  };

  const mount = () => {
    ensureStyle();
    if (!MAP_BANNER) return;

    const rawLink = readMapLink();
    const info = rawLink && normalizeMap(rawLink);
    if (!info || info.lat==null || info.lon==null) { log('no coords'); return; }

    const outHref = formatOutLink(info);
    const embed   = osmEmbedUrl(info.lat, info.lon, MAP_ZOOM);
    const rawDate = readDateRaw();
    const dateTxt = parseFrontmatterDate(rawDate);

    ensureBanner(embed, outHref, dateTxt);
  };

  // ----- boot / SPA -----
  const haveFM = () => qFM(document).length > 0;
  const waitFM = (cb) => {
    if (haveFM()) { cb(); return; }
    const mo = new MutationObserver(() => { if (haveFM()) { mo.disconnect(); cb(); } });
    mo.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => { if (haveFM()) { mo.disconnect(); cb(); } }, 2000);
  };

  const boot = () => {
    waitFM(mount);

    // Re-mount when URL path changes
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        waitFM(() => scheduleMount());
      }
    }, 200);

    // Re-mount on SPA mutations, but debounced & non-destructive
    const mo = new MutationObserver(() => scheduleMount());
    mo.observe(getContainer() || document.body, { childList:true, subtree:true, attributes:false });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();