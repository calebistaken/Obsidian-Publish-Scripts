/**
 * Obsidian Publish — H1 over OSM iframe in a skinny, edge-to-edge banner
 * - Banner is flush with the top of rendered content (no top margin; no rounded corners)
 * - H1 remains inside the banner; clicking it opens your map link
 * - Top nav (from nav-links.js) is absolutely positioned at the top of the banner
 * - Bottom-left: date (frontmatter 'date' as string) in monospace
 * - Bottom-right: location (derived from 'address' frontmatter) in monospace
 *
 * Optional globals:
 *   window.MAP_BANNER = true
 *   window.MAP_PREF   = 'auto'|'apple'|'google'|'osm'
 *   window.MAP_ZOOM   = 12
 *   window.MAP_HEIGHT = 120          // px (skinny banner)
 *   window.MAP_CLICK_NEW_TAB = true
 */

(() => {
  // ---------- config ----------
  const MAP_BANNER = typeof window.MAP_BANNER === 'boolean' ? window.MAP_BANNER : true;
  const MAP_PREF = typeof window.MAP_PREF === 'string' ? window.MAP_PREF : 'auto';
  const MAP_ZOOM = Number.isFinite(window.MAP_ZOOM) ? window.MAP_ZOOM : 12;
  const MAP_HEIGHT = Number.isFinite(window.MAP_HEIGHT) ? window.MAP_HEIGHT : 120;
  const MAP_CLICK_NEW_TAB = (typeof window.MAP_CLICK_NEW_TAB === 'boolean') ? window.MAP_CLICK_NEW_TAB : true;

  // Visual tuning
  const MAP_OPACITY = Number.isFinite(window.MAP_OPACITY) ? window.MAP_OPACITY : 0.55;
  const MAP_GRAYSCALE = Number.isFinite(window.MAP_GRAYSCALE) ? window.MAP_GRAYSCALE : 0.5;
  const MAP_BLUR_PX = Number.isFinite(window.MAP_BLUR_PX) ? window.MAP_BLUR_PX : 1.0;
  const MAP_BRIGHTNESS = Number.isFinite(window.MAP_BRIGHTNESS) ? window.MAP_BRIGHTNESS : 0.95;

  // Overlay (kept as numeric alphas; colors will come from theme via blending)
  const OL_L = Number.isFinite(window.MAP_OVERLAY_L) ? window.MAP_OVERLAY_L : 0.06;
  const OL_L2 = Number.isFinite(window.MAP_OVERLAY_L2) ? window.MAP_OVERLAY_L2 : 0.12;
  const OL_D = Number.isFinite(window.MAP_OVERLAY_D) ? window.MAP_OVERLAY_D : 0.18;
  const OL_D2 = Number.isFinite(window.MAP_OVERLAY_D2) ? window.MAP_OVERLAY_D2 : 0.34;

  const STYLE_ID = 'h1-iframe-style';
  const WRAP_ID = 'h1-map-wrap';
  const LAYER_ID = 'h1-map-layer';
  const IFRAME_ID = 'h1-map-iframe';
  const H1_CLASS = 'h1-map-hero';

  const META_CLASS = 'h1-map-meta';
  const META_LEFT = 'h1-map-meta-left';
  const META_RIGHT = 'h1-map-meta-right';

  // ---------- utils ----------
  const getContainer = () =>
    document.querySelector('#content') ||
    document.querySelector('.markdown-preview-view') ||
    document.querySelector('.markdown-preview-section') ||
    document.body;

  const getH1 = () =>
    document.querySelector('.markdown-preview-view h1, #content h1, .view-content h1, h1');

  const bodyBg = () => getComputedStyle(document.body).backgroundColor || 'transparent';

  // Safely unwrap previous wrapper so H1 never disappears on SPA re-mounts
  const safeUnwrap = () => {
    const wrap = document.getElementById(WRAP_ID);
    if (!wrap) return;
    const h1 = wrap.querySelector('h1');
    if (h1) wrap.replaceWith(h1);
    else wrap.remove();
  };

  // ---------- styles ----------
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
      :root {
        --map-h: ${MAP_HEIGHT}px;
        --map-opacity: ${MAP_OPACITY};
        --map-gray: ${MAP_GRAYSCALE};
        --map-blur: ${MAP_BLUR_PX}px;
        --map-bright: ${MAP_BRIGHTNESS};

        /* Prefer Obsidian theme vars with sensible fallbacks */
        --map-bg: var(--background-primary, transparent);
        --map-radius: var(--radius-s, 6px);
        --map-font-mono: var(--font-monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
        --map-font-size: var(--font-small, 0.85rem);
        --map-text-color: var(--text-normal, inherit);
        --map-text-muted: var(--text-muted, rgba(255,255,255,.9));
      }

      /* Skinny banner, flush to top of content */
      #${WRAP_ID} {
        position: relative;
        width: 100%;
        height: var(--map-h);
        margin: 0 0 .85rem 0;
        border-radius: var(--map-radius);
        overflow: hidden;
        background: var(--page-bg, var(--map-bg));
        isolation: isolate; /* keep overlays stacking sane */
      }

      /* Simple layer container (no radial fade) */
      #${LAYER_ID} {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
      }

      #${IFRAME_ID} {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        filter: grayscale(var(--map-gray)) brightness(var(--map-bright)) blur(var(--map-blur));
        opacity: var(--map-opacity);
        z-index: 1;
      }

      /* Theme-aware top/bottom gradient overlay for legibility */
      #${WRAP_ID}::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        /* Use currentColor blending over theme background for subtle contrast */
        background: linear-gradient(
          180deg,
          rgba(0, 0, 0, ${OL_L}),
          rgba(0, 0, 0, ${OL_L2})
        );
      }

      body.theme-dark #${WRAP_ID}::after {
        background: linear-gradient(
          180deg,
          rgba(0, 0, 0, ${OL_D}),
          rgba(0, 0, 0, ${OL_D2})
        );
      }

      /* H1 sits above; leave space at top for absolute nav and at bottom for meta */
      .${H1_CLASS} {
        position: relative;
        z-index: 3;
        margin: 0;
        min-height: var(--map-h);
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;

        color: var(--map-text-color);
        text-shadow: 0 1px 3px rgba(0,0,0,.6);

        cursor: pointer;
        outline-offset: 2px;

        padding-top: 1rem;      /* space for top nav */
        padding-bottom: 1.6rem; /* space for bottom meta */
      }
      .${H1_CLASS}[tabindex="0"]:focus {
        outline: 2px solid currentColor;
      }

      /* Top nav from nav-links.js will be absolutely positioned at top */
      #${WRAP_ID} > .note-nav.is-top {
        z-index: 5; /* ensure above overlays */
      }

      /* Bottom metadata (monospace) */
      #${WRAP_ID} .${META_CLASS} {
        position: absolute;
        z-index: 4;
        bottom: .35rem;
        left: .5rem;
        right: .5rem;

        display: flex;
        align-items: center;
        justify-content: space-between;

        font-family: var(--map-font-mono);
        font-size: var(--map-font-size);
        line-height: 1.1;
        letter-spacing: .01em;

        color: var(--map-text-muted);
        text-shadow: 0 1px 2px rgba(0,0,0,.6);

        pointer-events: none; /* purely informational */
      }
      #${WRAP_ID} .${META_LEFT}  { text-align: left;  }
      #${WRAP_ID} .${META_RIGHT} { text-align: right; }
    `;

    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  };

  // ---------- frontmatter helpers (date, address, map_link) ----------
  const qFM = (root = document) =>
    root.querySelectorAll([
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
    const nodes = qFM(document);

    // table
    for (const n of nodes) {
      if (n.tagName === 'TABLE') {
        for (const tr of n.querySelectorAll('tr')) {
          const k = tr.querySelector('th, td:first-child');
          const v = tr.querySelector('td:last-child');
          if (k && v && k.textContent.trim() === fieldName) {
            return v.textContent.trim().replace(/^["']|["']$/g, '');
          }
        }
      }
    }

    // prism/raw
    const rx = new RegExp(`^\\s*${fieldName}\\s*:\\s*["']?(.+?)["']?\\s*$`, 'mi');
    for (const n of nodes) {
      if (n.tagName === 'TABLE') continue;
      const txt = (n.innerText || n.textContent || '').replace(/&amp;/g, '&');
      const m = txt.match(rx);
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

  // ---------- URL → coords + outbound ----------
  const toFloat = (s) => {
    const n = parseFloat(String(s).trim());
    return Number.isFinite(n) ? n : null;
  };

  const pair = (s) => {
    if (!s) return null;
    const m = String(s).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat = toFloat(m[1]);
    const lon = toFloat(m[2]);
    return (lat == null || lon == null) ? null : { lat, lon };
  };

  const qobj = (u) => {
    const o = Object.create(null);
    for (const [k, v] of u.searchParams.entries()) o[k] = v;
    return o;
  };

  const normalizeMap = (raw) => {
    let href = (raw || '').replace(/&amp;/g, '&').trim();
    if (!/^https?:\/\//i.test(href)) return null;

    let u;
    try { u = new URL(href); } catch { return null; }

    const host = u.hostname.toLowerCase();

    if (host.endsWith('maps.apple.com')) {
      const q = qobj(u);
      const c = pair(q.ll || q.sll) || pair(q.q);
      return { provider: 'apple', href: u.href, ...(c || {}) };
    }

    if (host.includes('google.') && u.pathname.toLowerCase().includes('/maps')) {
      const at = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const q = qobj(u);
      const c = (at && { lat: toFloat(at[1]), lon: toFloat(at[2]) }) || pair(q.q) || pair(q.query);
      return { provider: 'google', href: u.href, ...(c || {}) };
    }

    if (host.includes('openstreetmap.org')) {
      const q = qobj(u);
      let lat = toFloat(q.mlat), lon = toFloat(q.mlon);
      if (lat == null || lon == null) {
        const m = (u.hash || '').match(/map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
        if (m) { lat = toFloat(m[1]); lon = toFloat(m[2]); }
      }
      return { provider: 'osm', href: u.href, lat, lon };
    }

    return { provider: 'unknown', href: u.href, lat: null, lon: null };
  };

  const formatOutLink = ({ provider, href, lat, lon }) => {
    if (lat == null || lon == null) return href;
    const prefer = (MAP_PREF === 'auto') ? provider : MAP_PREF;

    if (prefer === 'apple') {
      const u = new URL('https://maps.apple.com/');
      u.searchParams.set('ll', `${lat},${lon}`);
      return u.href;
    }

    if (prefer === 'google') {
      const u = new URL('https://www.google.com/maps');
      u.searchParams.set('q', `${lat},${lon}`);
      return u.href;
    }

    if (prefer === 'osm') {
      const u = new URL('https://www.openstreetmap.org/');
      u.hash = `#map=${MAP_ZOOM}/${lat}/${lon}`;
      u.searchParams.set('mlat', lat);
      u.searchParams.set('mlon', lon);
      return u.href;
    }

    return href;
  };

  // ---------- OSM embed ----------
  const bboxFor = (lat, lon, zoom, pxW = 1200, pxH = MAP_HEIGHT) => {
    const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    const halfWm = (pxW * mpp) / 2;
    const halfHm = (pxH * mpp) / 2;
    const latDegPerM = 1 / 111320;
    const lonDegPerM = 1 / (111320 * Math.cos(lat * Math.PI / 180));
    return {
      left: lon - halfWm * lonDegPerM,
      right: lon + halfWm * lonDegPerM,
      top: lat + halfHm * latDegPerM,
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

  // ---------- H1 wiring ----------
  const wireH1Click = (href) => {
    const h1 = getH1();
    if (!h1) return;
    if (h1.dataset.mapBound === '1' && h1.dataset.mapHref === href) return;

    h1.dataset.mapBound = '1';
    h1.dataset.mapHref = href;
    h1.classList.add(H1_CLASS);
    h1.setAttribute('role', 'link');
    h1.setAttribute('tabindex', '0');

    const open = () => {
      const url = h1.dataset.mapHref;
      if (!url) return;
      if (MAP_CLICK_NEW_TAB) window.open(url, '_blank', 'noopener');
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

  const buildMeta = (dateStr, locationText) => {
    const meta = document.createElement('div');
    meta.className = META_CLASS;

    const left = document.createElement('div');
    left.className = META_LEFT;
    left.textContent = dateStr ? String(dateStr) : '';

    const right = document.createElement('div');
    right.className = META_RIGHT;
    right.textContent = locationText ? `${locationText}` : '';

    meta.append(left, right);
    return meta;
  };

  // ---------- build / mount ----------
  const wrapH1WithIframe = (embedSrc) => {
    const h1 = getH1();
    if (!h1) return null;

    // wrapper
    const wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.style.setProperty('--page-bg', bodyBg());

    // insert before h1, move h1 inside
    const parent = h1.parentNode;
    parent.insertBefore(wrap, h1);
    wrap.appendChild(h1);

    // layer holder
    const layer = document.createElement('div');
    layer.id = LAYER_ID;
    wrap.appendChild(layer);

    // iframe
    const ifr = document.createElement('iframe');
    ifr.id = IFRAME_ID;
    ifr.src = embedSrc;
    ifr.referrerPolicy = 'no-referrer-when-downgrade';
    ifr.loading = 'lazy';
    layer.appendChild(ifr);

    // metadata (bottom-left/right)
    const dateStr = readDateStr();
    const addrStr = readAddressStr();
    const locTxt = formatLocationFromAddress(addrStr);
    const meta = buildMeta(dateStr, locTxt);
    wrap.appendChild(meta);

    return { ifr, wrap };
  };

  let mounting = false;
  const mount = () => {
    if (mounting) return;
    mounting = true;

    ensureStyle();
    safeUnwrap(); // keep H1 safe on SPA re-mounts

    const raw = readMapLink();
    const info = raw && normalizeMap(raw);
    if (!MAP_BANNER || !info || info.lat == null || info.lon == null) {
      mounting = false;
      return;
    }

    const outHref = formatOutLink(info);
    const built = wrapH1WithIframe(osmEmbedUrl(info.lat, info.lon, MAP_ZOOM));
    if (built) wireH1Click(outHref);

    mounting = false;
  };

  // ---------- boot / SPA ----------
  const haveFM = () => qFM(document).length > 0;

  const waitFM = (cb) => {
    if (haveFM()) { cb(); return; }
    const mo = new MutationObserver(() => {
      if (haveFM()) { mo.disconnect(); cb(); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      if (haveFM()) { mo.disconnect(); cb(); }
    }, 2000);
  };

  const boot = () => {
    waitFM(mount);
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        waitFM(mount);
      }
    }, 150);
    const mo = new MutationObserver(() => {
      const w = document.getElementById(WRAP_ID);
      const h1 = getH1();
      if (!h1 || (w && !w.contains(h1)) || (h1 && h1.dataset.mapBound !== '1')) {
        waitFM(mount);
      }
    });
    mo.observe(getContainer() || document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();