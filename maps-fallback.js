/**
This version isn't pretty, but it seems to work'
 * Obsidian Publish — H1-top OSM iframe banner (no API key)
 * - Parses `map_link` from rendered frontmatter (Prism/table/raw)
 * - Renders a skinny OpenStreetMap <iframe> banner ABOVE the H1 (no API key)
 * - Adds an optional “Open in Maps” link BELOW the H1
 * - Uses an overlay <a> so clicking the banner opens your preferred maps app
 *
 * Optional globals (set before this script):
 *   window.MAP_BANNER = true;                         // show banner when coords found (default true)
 *   window.MAP_LINK_WITH_BANNER = true;               // also show link when banner present (default true)
 *   window.MAP_PREF   = 'auto'|'apple'|'google'|'osm';// click-through target (default 'auto')
 *   window.MAP_ZOOM   = 12;                           // visual zoom for bbox sizing (default 12)
 *   window.MAP_HEIGHT = 160;                          // banner height in px (default 160)
 *   window.MAP_DEBUG  = false;                        // console logging
 */

(() => {
  // ---- Config ----
  const MAP_BANNER = (typeof window.MAP_BANNER === 'boolean') ? window.MAP_BANNER : true;
  const MAP_LINK_WITH_BANNER = (typeof window.MAP_LINK_WITH_BANNER === 'boolean') ? window.MAP_LINK_WITH_BANNER : true;
  const MAP_PREF = (typeof window.MAP_PREF === 'string') ? window.MAP_PREF : 'auto';
  const MAP_ZOOM = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.MAP_HEIGHT) ? window.MAP_HEIGHT : 160;
  const MAP_DEBUG = !!window.MAP_DEBUG;
  const log = (...a)=> MAP_DEBUG && console.log('[map-iframe]', ...a);

  const STYLE_ID = 'map-iframe-style';
  const BANNER_ID = 'map-iframe-banner';
  const LINK_ID = 'map-inline-link';

  // ---- Styles ----
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #${BANNER_ID}{position:relative;width:100%;margin:.75rem 0 1rem 0;border-radius:var(--img-border-radius,8px);overflow:hidden}
      #${BANNER_ID} iframe{display:block;width:100%;height:${MAP_HEIGHT}px;border:0}
      #${BANNER_ID} a.overlay{position:absolute;inset:0;display:block;text-indent:-9999px;overflow:hidden}
      #${LINK_ID}{display:inline-block;margin:.25rem 0 .75rem 0}
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

  const getTitleNode = () =>
    document.querySelector('.markdown-preview-view h1, #content h1, .view-content h1, h1');

  // Insert ABOVE H1
  const placeBanner = (node) => {
    const title = getTitleNode();
    const container = getContainer();
    const old = document.getElementById(BANNER_ID);
    if (old) old.remove();
    if (title && title.parentNode) title.parentNode.insertBefore(node, title);
    else container.insertBefore(node, container.firstChild);
  };

  // Insert BELOW H1
  const placeLink = (node) => {
    const title = getTitleNode();
    const container = getContainer();
    const old = document.getElementById(LINK_ID);
    if (old) old.remove();
    if (title && title.parentNode) title.parentNode.insertBefore(node, title.nextSibling);
    else container.insertBefore(node, container.firstChild);
  };

  // ---- Frontmatter parsing (map_link) ----
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
      const val = (n.tagName==='TABLE') ? parseMapFromRaw(n) : (parseMapFromTokens(n)||parseMapFromRaw(n));
      if (val) return val;
    }
    return null;
  };

  // ---- URL → coords + outbound link ----
  const toFloat = (s)=>{const n=parseFloat(String(s).trim());return Number.isFinite(n)?n:null;};
  const extractLatLonPair = (str)=>{
    if (!str) return null;
    const m=String(str).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat=toFloat(m[1]), lon=toFloat(m[2]);
    return (lat==null||lon==null)?null:{lat,lon};
  };
  const parseQuery = (u)=>{const o=Object.create(null); for (const [k,v] of u.searchParams.entries()) o[k]=v; return o;};

  const normalizeMap = (rawUrl) => {
    let href = (rawUrl||'').replace(/&amp;/g,'&').trim();
    if (!/^https?:\/\//i.test(href)) return null;
    let u; try { u=new URL(href); } catch { return null; }
    const host=u.hostname.toLowerCase();

    // Apple
    if (host.endsWith('maps.apple.com')){
      const q=parseQuery(u);
      const coords = extractLatLonPair(q.ll||q.sll) || extractLatLonPair(q.q);
      return {provider:'apple', href:u.href, ...coords};
    }
    // Google
    if (host.includes('google.') && u.pathname.toLowerCase().includes('/maps')){
      const at=u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const q=parseQuery(u);
      const coords = (at && {lat:toFloat(at[1]), lon:toFloat(at[2])}) || extractLatLonPair(q.q) || extractLatLonPair(q.query);
      return {provider:'google', href:u.href, ...coords};
    }
    // OSM
    if (host.includes('openstreetmap.org')){
      const q=parseQuery(u);
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

  // ---- Compute OSM embed bbox (no key) ----
  // Derive bbox size from zoom & banner pixel size using Web Mercator approximations.
  const bboxFor = (lat, lon, zoom, pxW=1200, pxH=MAP_HEIGHT) => {
    // meters per pixel at latitude
    const mpp = 156543.03392 * Math.cos(lat * Math.PI/180) / Math.pow(2, zoom);
    const halfWm = (pxW * mpp) / 2;
    const halfHm = (pxH * mpp) / 2;
    // meters → degrees
    const latDegPerM = 1 / 111320; // approx
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

  // ---- Build nodes ----
  const buildBanner = (embedSrc, outHref) => {
    const wrap = document.createElement('div');
    wrap.id = BANNER_ID;
    const iframe = document.createElement('iframe');
    iframe.src = embedSrc;
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.loading = 'lazy';
    // Click-through overlay (so clicking the banner opens preferred app)
    const overlay = document.createElement('a');
    overlay.className = 'overlay';
    overlay.href = outHref;
    overlay.target = '_blank';
    overlay.rel = 'noopener';
    overlay.textContent = 'Open in Maps';
    wrap.appendChild(iframe);
    wrap.appendChild(overlay);
    return wrap;
  };

  const buildLink = (href) => {
    const a = document.createElement('a');
    a.id = LINK_ID;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Open in Maps';
    return a;
  };

  // ---- Mount ----
  let mounting = false;
  const mount = () => {
    if (mounting) return;
    mounting = true;

    ensureStyle();
    const oldB = document.getElementById(BANNER_ID); if (oldB) oldB.remove();
    const oldL = document.getElementById(LINK_ID);   if (oldL) oldL.remove();

    const raw = readMapLink();
    if (!raw) { log('no map_link'); mounting = false; return; }

    const info = normalizeMap(raw);
    if (!info || info.lat==null || info.lon==null) { log('no coords; link only'); 
      placeLink(buildLink((info && info.href) || raw)); mounting = false; return;
    }

    const outHref = formatOutLink(info);

    if (MAP_BANNER) {
      const src = osmEmbedUrl(info.lat, info.lon, MAP_ZOOM);
      placeBanner(buildBanner(src, outHref));
    }
    if (!MAP_BANNER || MAP_LINK_WITH_BANNER) {
      placeLink(buildLink(outHref));
    }

    mounting = false;
  };

  // ---- Boot / SPA safety ----
  const haveFrontmatter = () => qFrontmatterNodes(document).length > 0;
  const waitForFrontmatter = (cb) => {
    if (haveFrontmatter()) { cb(); return; }
    const obs = new MutationObserver(() => { if (haveFrontmatter()) { obs.disconnect(); cb(); } });
    obs.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => { if (haveFrontmatter()) { obs.disconnect(); cb(); } }, 2000);
  };

  const boot = () => {
    waitForFrontmatter(mount);

    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        waitForFrontmatter(mount);
      }
    }, 150);

    const obs = new MutationObserver(() => {
      // if our nodes disappeared (SPA re-render), rebuild
      if (!document.getElementById(BANNER_ID) && !document.getElementById(LINK_ID)) {
        waitForFrontmatter(mount);
      }
    });
    obs.observe(getContainer() || document.body, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();