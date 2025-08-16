/**
 * Obsidian Publish — H1 map banner (no API key, no iframes)
 * - Reads `map_link` from rendered frontmatter (Prism/table/raw)
 * - Resolves lat/lon from Apple/Google/OSM-style links
 * - Preloads a static map (OSM DE → OSM FR → Yandex), using blob/data/direct strategies
 * - On success, sets the H1 background; on failure, leaves H1 untouched
 * - Optionally inserts a single “Open in Maps” link below H1
 *
 * Globals (set before this script if you want):
 *   window.MAP_BANNER = true                 // enable H1 background banner
 *   window.MAP_LINK_WITH_BANNER = true       // show link even when banner shows
 *   window.MAP_PREF = 'auto'|'apple'|'google'|'osm' // click-through target
 *   window.MAP_ZOOM = 12                     // visual zoom
 *   window.MAP_HEIGHT = 220                  // H1 banner height (px)
 *   window.MAP_IMG_STRATEGY = 'auto'|'blob'|'data'|'direct' // image load strategy
 *   window.MAP_DEBUG = false                 // console logs
 */
(() => {
  const MAP_BANNER = typeof window.MAP_BANNER === 'boolean' ? window.MAP_BANNER : true;
  const MAP_LINK_WITH_BANNER = typeof window.MAP_LINK_WITH_BANNER === 'boolean' ? window.MAP_LINK_WITH_BANNER : true;
  const MAP_PREF = typeof window.MAP_PREF === 'string' ? window.MAP_PREF : 'auto';
  const MAP_ZOOM = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.MAP_HEIGHT) ? window.MAP_HEIGHT : 220;
  const MAP_IMG_STRATEGY = typeof window.MAP_IMG_STRATEGY === 'string' ? window.MAP_IMG_STRATEGY : 'auto';
  const MAP_DEBUG = !!window.MAP_DEBUG;
  const log = (...a)=> MAP_DEBUG && console.log('[h1-map]', ...a);

  const LINK_ID = 'map-inline-link';

  // ---------- DOM ----------
  const getContainer = () =>
    document.querySelector('#content') ||
    document.querySelector('.markdown-preview-view') ||
    document.querySelector('.markdown-preview-section') ||
    document.body;

  const getH1 = () =>
    document.querySelector('.markdown-preview-view h1, #content h1, .view-content h1, h1');

  const placeLink = (href) => {
    const old = document.getElementById(LINK_ID);
    if (old) old.remove();
    const a = document.createElement('a');
    a.id = LINK_ID;
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'Open in Maps';
    const h1 = getH1();
    const container = getContainer();
    if (h1 && h1.parentNode) h1.parentNode.insertBefore(a, h1.nextSibling);
    else container.insertBefore(a, container.firstChild);
  };

  const applyH1Background = (imgUrl) => {
    const h1 = getH1();
    if (!h1) return false;
    h1.style.setProperty('background-image', `url("${imgUrl}")`);
    h1.style.setProperty('background-size', 'cover');
    h1.style.setProperty('background-position', 'center');
    h1.style.setProperty('height', `${MAP_HEIGHT}px`);
    h1.style.setProperty('display', 'flex');
    h1.style.setProperty('align-items', 'center');
    h1.style.setProperty('justify-content', 'center');
    h1.style.setProperty('color', 'white');
    h1.style.setProperty('text-shadow', '0 1px 3px rgba(0,0,0,0.75)');
    h1.style.setProperty('border-radius', '8px');
    h1.style.setProperty('margin-bottom', '0.75rem');
    return true;
  };

  // ---------- frontmatter parsing: map_link ----------
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
      if (!(t.classList.contains('key') && t.classList.contains('atrule'))) continue;
      if (t.textContent.trim()!=='map_link') continue;
      let j=i+1, str=null;
      while(j<tokens.length){
        const tj=tokens[j];
        if (tj.classList.contains('string')) { str=tj; break; }
        if (tj.classList.contains('key') || /\n/.test(tj.textContent)) break;
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
        if (k && v && k.textContent.trim()==='map_link'){
          return v.textContent.trim().replace(/^["']|["']$/g,'');
        }
      }
      return null;
    }
    const txt=(node.innerText||node.textContent||'').replace(/&amp;/g,'&');
    const m=txt.match(/^\s*map_link\s*:\s*["']?(.+?)["']?\s*$/mi);
    return m ? m[1].trim() : null;
  };

  const readMapLink = () => {
    const nodes = qFrontmatterNodes(document);
    for (const n of nodes){
      const val = (n.tagName==='TABLE') ? parseMapFromRaw(n) : (parseMapFromTokens(n) || parseMapFromRaw(n));
      if (val) return val;
    }
    return null;
  };

  // ---------- url → coords + out link ----------
  const toFloat = (s)=>{const n=parseFloat(String(s).trim()); return Number.isFinite(n)?n:null;};
  const pair = (s)=>{ if(!s) return null; const m=String(s).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); if(!m) return null; const lat=toFloat(m[1]), lon=toFloat(m[2]); return (lat==null||lon==null)?null:{lat,lon}; };
  const qobj = (u)=>{const o=Object.create(null); for (const [k,v] of u.searchParams.entries()) o[k]=v; return o;};

  const normalizeMap = (raw) => {
    let href=(raw||'').replace(/&amp;/g,'&').trim();
    if (!/^https?:\/\//i.test(href)) return null;
    let u; try { u=new URL(href); } catch { return null; }
    const host=u.hostname.toLowerCase();

    if (host.endsWith('maps.apple.com')){
      const q=qobj(u);
      const c = pair(q.ll||q.sll) || pair(q.q);
      return {provider:'apple', href:u.href, ...(c||{})};
    }
    if (host.includes('google.') && u.pathname.toLowerCase().includes('/maps')){
      const at=u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const q=qobj(u);
      const c = (at && {lat:toFloat(at[1]), lon:toFloat(at[2])}) || pair(q.q) || pair(q.query);
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
    if (prefer==='osm'){ const u=new URL('https://www.openstreetmap.org/'); u.hash = `#map=${MAP_ZOOM}/${lat}/${lon}`; u.searchParams.set('mlat',lat); u.searchParams.set('mlon',lon); return u.href; }
    return href;
  };

  // ---------- static providers (no key) ----------
  // OSM Germany
  const srcOSMde = (lat, lon, W=1200, H=Math.max(120, MAP_HEIGHT)) =>
    `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${MAP_ZOOM}&size=${encodeURIComponent(W+'x'+H)}&maptype=mapnik&markers=${lat},${lon},lightblue1`;
  // OSM France
  const srcOSMfr = (lat, lon, W=1200, H=Math.max(120, MAP_HEIGHT)) =>
    `https://staticmap.openstreetmap.fr/staticmap.php?center=${lat},${lon}&zoom=${MAP_ZOOM}&size=${encodeURIComponent(W+'x'+H)}&maptype=mapnik&markers=${lon},${lat},lightblue`;
  // Yandex Static (no key needed)
  const srcYandex = (lat, lon, W=1200, H=Math.max(120, MAP_HEIGHT)) => {
    const ll = `${lon},${lat}`; // note lon,lat order
    return `https://static-maps.yandex.ru/1.x/?ll=${ll}&z=${MAP_ZOOM}&size=${Math.min(W,650)},${Math.min(H,450)}&l=map&pt=${ll},pm2blm`;
  };

  const providers = (lat, lon) => [
    srcOSMde(lat, lon),
    srcOSMfr(lat, lon),
    srcYandex(lat, lon)
  ];

  // ---------- load strategies ----------
  const fetchAsBlobUrl = async (url) => {
    const res = await fetch(url, { mode:'cors', credentials:'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    return { url: obj, revoke: () => URL.revokeObjectURL(obj) };
  };
  const fetchAsDataUrl = async (url) => {
    const res = await fetch(url, { mode:'cors', credentials:'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    return { url: dataUrl, revoke: () => {} };
  };

  const tryStrategies = async (src) => {
    const order =
      MAP_IMG_STRATEGY === 'blob'   ? ['blob'] :
      MAP_IMG_STRATEGY === 'data'   ? ['data'] :
      MAP_IMG_STRATEGY === 'direct' ? ['direct'] :
      ['blob','data','direct'];
    for (const mode of order) {
      try {
        if (mode==='blob')  { log('try blob', src);  const r=await fetchAsBlobUrl(src);  return r; }
        if (mode==='data')  { log('try data', src);  const r=await fetchAsDataUrl(src);  return r; }
        if (mode==='direct'){ log('try direct', src); return { url: src, revoke: () => {} }; }
      } catch (e) { log('fail', mode, src, e?.message||e); }
    }
    throw new Error('all strategies failed');
  };

  const getWorkingImage = async (lat, lon) => {
    const list = providers(lat, lon);
    let lastErr = null;
    for (const src of list) {
      try { const r = await tryStrategies(src); return r; }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('no static provider worked');
  };

  // ---------- mount ----------
  let mounting = false;
  const mount = async () => {
    if (mounting) return; mounting = true;

    const raw = readMapLink();
    if (!raw) { mounting = false; return; }
    const info = normalizeMap(raw);
    if (!info) { mounting = false; return; }

    const outHref = formatOutLink(info);
    if (MAP_LINK_WITH_BANNER || (info.lat==null || info.lon==null)) {
      placeLink(outHref);
    }

    if (MAP_BANNER && info.lat != null && info.lon != null) {
      try {
        const { url, revoke } = await getWorkingImage(info.lat, info.lon);
        const ok = applyH1Background(url);
        if (ok) setTimeout(revoke, 1500);
      } catch (e) {
        log('banner failed', e?.message || e);
        // leave H1 as-is; link already placed
      }
    }

    mounting = false;
  };

  // ---------- boot / SPA ----------
  const haveFrontmatter = () => qFrontmatterNodes(document).length > 0;
  const waitForFrontmatter = (cb) => {
    if (haveFrontmatter()) { cb(); return; }
    const obs = new MutationObserver(() => { if (haveFrontmatter()) { obs.disconnect(); cb(); } });
    obs.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => { if (haveFrontmatter()) { obs.disconnect(); cb(); } }, 2000);
  };

  const boot = () => {
    waitForFrontmatter(() => { mount().catch(e=>log('mount err', e)); });

    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        waitForFrontmatter(() => { mount().catch(e=>log('mount err', e)); });
      }
    }, 150);

    const obs = new MutationObserver(() => {
      // if our link vanished (SPA re-render), remount
      if (!document.getElementById(LINK_ID)) {
        waitForFrontmatter(() => { mount().catch(e=>log('mount err', e)); });
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