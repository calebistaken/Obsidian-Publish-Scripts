(async function () {
  const load = (tag, attrs) => new Promise((res, rej) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    el.onload = res; el.onerror = rej;
    (tag === 'link' ? document.head : document.body).appendChild(el);
  });

  // LightGallery + plugins
  await load('link', { rel:'stylesheet', href:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/css/lightgallery-bundle.min.css' });
  await load('script', { src:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/lightgallery.min.js', defer:'' });
  await load('script', { src:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/plugins/thumbnail/lg-thumbnail.min.js', defer:'' });
  await load('script', { src:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/plugins/zoom/lg-zoom.min.js', defer:'' });
  await load('script', { src:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/plugins/fullscreen/lg-fullscreen.min.js', defer:'' });

  const isImgUrl = (u='') => /\.(avif|webp|jpe?g|png|gif|bmp|tiff?)($|\?)/i.test(u);

  const pickFromSrcset = (img) => {
    const cand = (img.currentSrc && isImgUrl(img.currentSrc)) ? img.currentSrc : '';
    const srcset = img.srcset || '';
    if (!srcset) return cand || img.src;
    let best = cand || '';
    let bestW = 0;
    srcset.split(',').forEach(part => {
      const [url, desc] = part.trim().split(/\s+/);
      if (!isImgUrl(url)) return;
      let w = 0;
      if (desc && desc.endsWith('w')) w = parseInt(desc,10);
      else if (desc && desc.endsWith('x')) w = Math.round((img.naturalWidth||0) * parseFloat(desc));
      if (w > bestW) { bestW = w; best = url; }
    });
    return best || img.src;
  };

  const captionFor = (img) => {
    let alt = img.getAttribute('alt') || '';
    // Strip leading/trailing spaces
    alt = alt.trim();
    // Ignore alt if it looks like just a filename
    if (alt && /\.(jpe?g|png|gif|webp|avif|tiff?)$/i.test(alt)) {
      alt = '';
    }
    return alt
      || img.getAttribute('title')
      || img.closest('figure')?.querySelector('figcaption')?.textContent
      || '';
  };

  const collectItems = (container) => {
    const imgs = Array.from(container.querySelectorAll('img')).filter(img => {
      if (!(img instanceof HTMLImageElement)) return false;
      if (!img.isConnected) return false;
      if (img.offsetParent === null) return false;
      if (img.closest('.no-auto-gallery, header, nav, footer')) return false;
      if (img.classList.contains('emoji') || img.classList.contains('callout-icon')) return false;
      if ((img.width || img.naturalWidth || 0) < 48) return false;
      return true;
    });

    const items = imgs.map(img => {
      const link = img.closest('a');
      const href = (link && isImgUrl(link.getAttribute('href')||'')) ? link.getAttribute('href') : pickFromSrcset(img);
      return {
        src: href,
        thumb: img.currentSrc || img.src,
        subHtml: captionFor(img),
        width: img.naturalWidth || undefined,
        height: img.naturalHeight || undefined
      };
    }).filter(it => isImgUrl(it.src));

    const idxMap = new Map();
    imgs.forEach((img, i) => idxMap.set(img, i));
    return { imgs, items, idxMap };
  };

  let lg = null;

  const init = () => {
    const container = document.querySelector('.markdown-rendered');
    if (!container || container.dataset.lgBound === '1') return;

    const { imgs, items, idxMap } = collectItems(container);
    if (!items.length) return;

    const host = document.createElement('div');
    host.style.display = 'none';
    container.appendChild(host);

    lg = lightGallery(host, {
      dynamic: true,
      dynamicEl: items,
      thumbnail: true,
      animateThumb: true,
      showThumbByDefault: true,
      zoom: true,
      fullscreen: true,
      download: false,
      speed: 300,
      addClass: 'lg-obsidian'
    });

    imgs.forEach(img => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', (e) => {
        e.preventDefault();
        const i = idxMap.get(img) ?? 0;
        const rebuilt = collectItems(container);
        if (rebuilt.items.length && rebuilt.items.length !== items.length) {
          lg.refresh(rebuilt.items);
        }
        lg.openGallery(i);
      }, { passive: false });
    });

    container.dataset.lgBound = '1';
  };

  let timer;
  const mo = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const container = document.querySelector('.markdown-rendered');
      if (!container) return;
      if (container.dataset.lgBound !== '1') {
        try { lg && lg.destroy(true); } catch {}
        lg = null;
        init();
      }
    }, 120);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('load', () => {
    const container = document.querySelector('.markdown-rendered');
    if (!container) return;
    const { items } = collectItems(container);
    if (lg && items.length) lg.refresh(items);
  });
})();