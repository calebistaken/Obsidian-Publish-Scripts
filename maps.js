/**
 * Obsidian Publish — Quiet H1-over-map banner (no API key, H1 font untouched)
 * - Wraps <h1> in a container; OSM <iframe> sits behind it
 * - Adjustable "quiet" styling: opacity / grayscale / blur / brightness
 * - H1 becomes the clickable link to your preferred maps app
 *
 * Optional globals (set before this script):
 *   window.MAP_BANNER = true;                         // enable banner
 *   window.MAP_PREF   = 'auto'|'apple'|'google'|'osm';// click-through target
 *   window.MAP_ZOOM   = 12;                           // bbox sizing
 *   window.MAP_HEIGHT = 140;                          // banner height (px)
 *   window.MAP_CLICK_NEW_TAB = true;                  // open link in new tab
 *   // "Quiet" look (tweak to taste):
 *   window.MAP_OPACITY    = 0.55;  // 0..1   lower = quieter
 *   window.MAP_GRAYSCALE  = 0.5;   // 0..1   1=fully gray
 *   window.MAP_BLUR_PX    = 1.5;   // px     subtle blur
 *   window.MAP_BRIGHTNESS = 0.95;  // 0..1   <1 darkens a bit
 *   window.MAP_OVERLAY_L  = 0.08;  // overlay top alpha (light theme)
 *   window.MAP_OVERLAY_L2 = 0.16;  // overlay bottom alpha (light theme)
 *   window.MAP_OVERLAY_D  = 0.20;  // overlay top alpha (dark theme)
 *   window.MAP_OVERLAY_D2 = 0.38;  // overlay bottom alpha (dark theme)
 *   window.MAP_TEXT_SHADOW = true; // keep a subtle shadow for legibility
 */
(() => {
  // ---- config ----
  const MAP_BANNER = typeof window.MAP_BANNER === 'boolean' ? window.MAP_BANNER : true;
  const MAP_PREF   = typeof window.MAP_PREF === 'string' ? window.MAP_PREF : 'auto';
  const MAP_ZOOM   = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.MAP_HEIGHT) ? window.MAP_HEIGHT : 140;
  const MAP_CLICK_NEW_TAB = typeof window.MAP_CLICK_NEW_TAB === 'boolean' ? window.MAP_CLICK_NEW_TAB : true;

  const MAP_OPACITY    = Number.isFinite(window.MAP_OPACITY)    ? window.MAP_OPACITY    : 0.55;
  const MAP_GRAYSCALE  = Number.isFinite(window.MAP_GRAYSCALE)  ? window.MAP_GRAYSCALE  : 0.5;
  const MAP_BLUR_PX    = Number.isFinite(window.MAP_BLUR_PX)    ? window.MAP_BLUR_PX    : 1.5;
  const MAP_BRIGHTNESS = Number.isFinite(window.MAP_BRIGHTNESS) ? window.MAP_BRIGHTNESS : 0.95;
  const OL_L  = Number.isFinite(window.MAP_OVERLAY_L)  ? window.MAP_OVERLAY_L  : 0.08;
  const OL_L2 = Number.isFinite(window.MAP_OVERLAY_L2) ? window.MAP_OVERLAY_L2 : 0.16;
  const OL_D  = Number.isFinite(window.MAP_OVERLAY_D)  ? window.MAP_OVERLAY_D  : 0.20;
  const OL_D2 = Number.isFinite(window.MAP_OVERLAY_D2) ? window.MAP_OVERLAY_D2 : 0.38;
  const TEXT_SHADOW = (typeof window.MAP_TEXT_SHADOW === 'boolean') ? window.MAP_TEXT_SHADOW : true;

  const STYLE_ID  = 'map-wrap-h1-quiet-style';
  const WRAP_ID   = 'map-h1-wrap';
  const IFRAME_ID = 'map-h1-iframe';
  const H1_CLASS  = 'map-h1-hero';

  // ---- styles (H1 font untouched) ----
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      :root{
        --map-h:${MAP_HEIGHT}px;
        --map-opacity:${MAP_OPACITY};
        --map-gray:${MAP_GRAYSCALE};
        --map-blur:${MAP_BLUR_PX}px;
        --map-bright:${MAP_BRIGHTNESS};
      }
      #${WRAP_ID}{
        position:relative;width:100%;height:var(--map-h);
        margin:.5rem 0 .75rem 0;border-radius:var(--img-border-radius,8px);
        overflow:hidden;
      }
      #${IFRAME_ID}{
        position:absolute;inset:0;width:100%;height:100%;border:0;display:block;
        z-index:1; pointer-events:none;
        filter: grayscale(var(--map-gray)) brightness(var(--map-bright)) blur(var(--map-blur));
        opacity: var(--map-opacity);
        transform: translateZ(0); /* better rendering on iOS */
      }
      #${WRAP_ID}::after{
        content:""; position:absolute; inset:0; z-index:2; pointer-events:none;
        background: linear-gradient(180deg, rgba(0,0,0,${OL_L}), rgba(0,0,0,${OL_L2}));
        transition: background .2s ease;
      }
      body.theme-dark #${WRAP_ID}::after{
        background: linear-gradient(180deg, rgba(0,0,0,${OL_D}), rgba(0,0,0,${OL_D2}));
      }
      .${H1_CLASS}{
        position:relative; z-index:3; margin:0; min-height:var(--map-h);
        display:flex; align-items:center; justify-content:center; text-align:center;
        border-radius:var(--img-border-radius,8px);
        cursor:pointer; outline-offset:2px;
        ${TEXT_SHADOW ? 'text-shadow:0 1px 3px rgba(0,0,0,.65);' : ''}
      }
      /* keep nav tappable if near banner */
      .note-nav{ position:relative; z-index:4; }
    `;
    const el = document.createElement('style');
    el.id = STYLE_ID; el.textContent = css;
    document.head.appendChild(el);
  };

  // ---- DOM helpers ----
  const getContainer = () =>
    document.querySelector('#content') ||
    document.querySelector('.markdown-preview-view') ||
    document.querySelector('.markdown-preview-section') ||
    document.body;

  const getH1 = () =>
    document.querySelector('.markdown-preview-view h1, #content h1, .view-content h1, h1');

  const wrapH1WithIframe = (embedSrc) => {
    const h1 = getH1(); if (!h1) return;
    let wrap = document.getElementById(WRAP_ID);
    if (wrap && wrap.contains(h1)) {
      const ifr = document.getElementById(IFRAME_ID);
      if (ifr) ifr.src = embedSrc;
      return;
    }
    wrap?.remove();
    wrap = document.createElement('div');
    wrap.id = WRAP_ID;

    const parent = h1.parentNode;
    parent.insertBefore(wrap, h1);
    wrap.appendChild(h1);
    h1.classList.add(H1_CLASS);

    const ifr = document.createElement('iframe');
    ifr.id = IFRAME_ID;
    ifr.src = embedSrc;
    ifr.referrerPolicy = 'no-referrer-when-downgrade';
    ifr.loading = 'lazy';
    wrap.appendChild(ifr);
  };

  const wireH1Click = (href) => {
    const h1 = getH1(); if (!h1) return;
    if (h1.dataset.mapBound === '1' && h1.dataset.mapHref === href) return;
    h1.dataset.mapBound = '1';
    h1.dataset.mapHref  = href;
    h1.setAttribute('role','link');
    h1.setAttribute('tabindex','0');
    h1.setAttribute('aria-label','Open location in maps');
    const open = () => {
      const url = h1.dataset.mapHref; if (!url) return;
      if (MAP_CLICK_NEW_TAB) window.open(url,'_blank','noopener');
      else location.href = url;
    };
    h1.addEventListener('click', (e) => {
      if ((e.target instanceof Element) && e.target.closest('a')) return;
      open();
    });
    h1.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  };

  // ---- frontmatter parsing (map_link) ----
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
    for (let i=0;i<tokens.length;i++){
      const t=tokens[i];
      if (!(t.classList.contains('key')&&t.classList.contains('atrule'))) continue;
      if (t.textContent.trim()!=='map_link') continue;
      let j=i+1,str=null;
      while(j<tokens.length){
        const tj=tokens[j];
        if (tj.classList.contains('string')){str=tj;break;}
        if (tj.classList.contains('key')||/\n/.test(tj.textContent)) break;
        j++;
      }
      if (!str) continue;
      return (str.textContent||'').trim().replace(/^["']|["']$/g,'');
    }
    return null;
  };
  const parseMapFromRaw = (node) => {
    if (node.tagName==='TABLE'){
      for (const tr of node.querySelectorAll('tr')){
        const k=tr.querySelector('th, td:first-child');
        const v=tr.querySelector('td:last-child');
        if (k&&v && k.textContent.trim()==='map_link'){
          return v.textContent.trim().replace(/^["']|["']$/g,'');
        }
      }
      return null;
    }
    const txt=(node.innerText||node.textContent||'').replace(/&amp;/g,'&');
    const m=txt.match(/^\s*map_link\s*:\s*["']?(.+?)["']?\s*$/mi);
    return m?m[1].trim():null;
  };
  const readMapLink = () => {
    const nodes=qFrontmatterNodes(document);
    for (const n of nodes){
      const val=(n.tagName==='TABLE')?parseMapFromRaw(n):(parseMapFromTokens(n)||parseMapFromRaw(n));
      if (val) return val;
    }
    return null;
  };

  // ---- url utils ----
  const toFloat = (s)=>{const n=parseFloat(String(s).trim());return Number.isFinite(n)?n:null;};
  const pair = (s)=>{ if(!s) return null; const m=String(s).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); if(!m) return null; const lat=toFloat(m[1]), lon=toFloat(m[2]); return (lat==null||lon==null)?null:{lat,lon}; };
  const qobj = (u)=>{const o=Object.create(null); for (const [k,v] of u.searchParams.entries()) o[k]=v; return o;};

  const normalizeMap = (rawUrl) => {
    let href=(rawUrl||'').replace(/&amp;/g,'&').trim();
    if (!/^https?:\/\//i.test(href)) return null;
    let u; try { u=new URL(href); } catch { return null; }
    const host=u.hostname.toLowerCase();

    if (host.endsWith('maps.apple.com')){
      const q=qobj(u);
      const c=pair(q.ll||q.sll)||pair(q.q);
      return {provider:'apple', href:u.href, ...(c||{})};
    }
    if (host.includes('google.') && u.pathname.toLowerCase().includes('/maps')){
      const at=u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const q=qobj(u);
      const c=(at && {lat:toFloat(at[1]),lon:toFloat(at[2])}) || pair(q.q) || pair(q.query);
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

  // ---- OSM embed URL ----
  const bboxFor = (lat, lon, zoom, pxW=1200, pxH=MAP_HEIGHT) => {
    const mpp = 156543.03392 * Math.cos(lat * Math.PI/180) / Math.pow(2, zoom);
    const halfWm = (pxW * mpp) / 2;
    const halfHm = (pxH * mpp) / 2;
    const latDegPerM = 1 / 111320;
    const lonDegPerM = 1 / (111320 * Math.cos(lat * Math.PI/180));
    const dLat = halfHm * latDegPerM;
    const dLon = halfWm * lonDegPerM;
    const left = lon - dLon, right = lon + dLon, top = lat + dLat, bottom = lat - dLat;
    return { left, bottom, right, top };
  };
  const osmEmbedUrl = (lat, lon, zoom) => {
    const { left, bottom, right, top } = bboxFor(lat, lon, zoom);
    const u = new URL('https://www.openstreetmap.org/export/embed.html');
    u.searchParams.set('bbox', `${left},${bottom},${right},${top}`);
    u.searchParams.set('layer', 'mapnik');
    u.searchParams.set('marker', `${lat},${lon}`);
    return u.href;
  };

  // ---- mount ----
  let mounting = false;
  const mount = () => {
    if (mounting) return; mounting = true;
    ensureStyle();

    document.getElementById(WRAP_ID)?.remove();

    const raw = readMapLink();
    const info = raw && normalizeMap(raw);
    if (!info || info.lat==null || info.lon==null) { mounting = false; return; }

    const outHref = formatOutLink(info);
    if (MAP_BANNER) {
      wrapH1WithIframe(osmEmbedUrl(info.lat, info.lon, MAP_ZOOM));
      // make H1 clickable
      const h1 = getH1(); if (h1) {
        wireH1Click(outHref);
      }
    }
    mounting = false;
  };

  // ---- boot / SPA ----
  const haveFM = () => qFrontmatterNodes(document).length > 0;
  const waitFM = (cb) => {
    if (haveFM()) { cb(); return; }
    const obs = new MutationObserver(() => { if (haveFM()) { obs.disconnect(); cb(); } });
    obs.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => { if (haveFM()) { obs.disconnect(); cb(); } }, 2000);
  };

  const boot = () => {
    waitFM(mount);
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) { lastPath = location.pathname; waitFM(mount); }
    }, 150);
    const obs = new MutationObserver(() => {
      const wrap = document.getElementById(WRAP_ID);
      const h1 = getH1();
      if (!wrap || !h1 || h1.dataset.mapBound !== '1') waitFM(mount);
    });
    obs.observe(getContainer() || document.body, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();