(async function () {
  // --- tiny loader ---
  const load = (tag, attrs) => new Promise((res, rej) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    el.onload = res; el.onerror = rej;
    (tag === 'link' ? document.head : document.body).appendChild(el);
  });

  // --- LightGallery (pinned versions) ---
  await load('link', { rel:'stylesheet', href:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/css/lightgallery-bundle.min.css' });
  await load('script', { src:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/lightgallery.min.js', defer:'' });
  await load('script', { src:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/plugins/thumbnail/lg-thumbnail.min.js', defer:'' });
  await load('script', { src:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/plugins/zoom/lg-zoom.min.js', defer:'' });
  await load('script', { src:'https://cdn.jsdelivr.net/npm/lightgallery@2.7.2/plugins/fullscreen/lg-fullscreen.min.js', defer:'' });

  // --- helpers ---
  const isImgUrl = (url='') => /\.(avif|webp|jpe?g|png|gif|bmp|tiff?)($|\?)/i.test(url);
  const eligibleImg = (img) => {
    if (!(img instanceof HTMLImageElement)) return false;
    if (!isImgUrl(img.currentSrc || img.src)) return false;
    if (!img.isConnected || img.offsetParent === null) return false; // visible-ish
    if (img.closest('.no-auto-gallery, .site-footer, header, nav')) return false;
    if (img.classList.contains('emoji') || img.classList.contains('callout-icon')) return false;
    return true;
  };
  const captionFor = (img) => {
    // alt | title | nearby figcaption | data-caption (escape HTML via textContent on a div)
    const cap = img.getAttribute('alt') || img.getAttribute('title')
      || img.closest('figure')?.querySelector('figcaption')?.textContent
      || '';
    const tmp = document.createElement('div');
    tmp.textContent = cap;
    return tmp.innerHTML;
  };

  // --- main init: make every embedded image clickable + one gallery per note ---
  const initGalleries = () => {
    document.querySelectorAll('.markdown-rendered:not([data-lg-ready])').forEach(container => {
      // Wrap images in anchors if needed
      const imgs = Array.from(container.querySelectorAll('img'));
      let madeAny = false;
      imgs.forEach(img => {
        if (!eligibleImg(img)) return;
        if (img.closest('a')) return; // already linked—don’t double-wrap
        const a = document.createElement('a');
        a.href = img.currentSrc || img.src;
        a.className = 'lg-item';
        a.setAttribute('data-sub-html', captionFor(img));
        // Preserve sizes set by Obsidian (width/height styles)
        img.replaceWith(a); a.appendChild(img);
        madeAny = true;
      });

      // If there are any anchors (either we wrapped or they were pre-linked), attach LG
      const anchors = container.querySelectorAll('a.lg-item, a[href$=".jpg"], a[href$=".jpeg"], a[href$=".png"], a[href$=".webp"], a[href$=".avif"], a[href$=".gif"]');
      if (anchors.length) {
        lightGallery(container, {
          selector: 'a',
          speed: 300,
          thumbnail: true,
          animateThumb: true,
          showThumbByDefault: true,
          zoom: true,
          fullscreen: true,
          download: false,
          // Optional: don’t zoom tiny UI images if any slipped through
          addClass: 'lg-obsidian',
        });
        container.dataset.lgReady = '1';
      }
    });
  };

  // Run now + on SPA nav/edits
  const start = () => initGalleries();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else start();

  // Mutation observer to catch page swaps and lazy loads
  new MutationObserver(() => initGalleries())
    .observe(document.body, { childList: true, subtree: true });
})();