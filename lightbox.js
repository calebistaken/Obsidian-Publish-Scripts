/**
 * Zoomable images + bottom thumbnail strip
**/
(() => {
  if (window.__obsZoomBoundV4) return;
  window.__obsZoomBoundV4 = true;

  const SELECTOR_MEDIA =
    '.markdown-rendered .image-embed img, .markdown-rendered .video-embed video';

  const looksLikeFilename = (alt) =>
    !!alt && /\.(png|jpe?g|tiff?|webp|gif|svg|mov|mp4|webm)$/i.test(alt.trim());

  let mediaList = [];
  let currentIndex = -1;

  function collectMedia() {
    const root = document.querySelector('.markdown-rendered') || document;
    mediaList = Array.from(root.querySelectorAll(SELECTOR_MEDIA));
  }

  function captionFor(el) {
    const alt = (el.getAttribute('alt') || '').trim();
    return alt && !looksLikeFilename(alt) ? alt : '';
  }

  function destroyMediaIn(wrap) {
    const prev = wrap.querySelector('.zoom-overlay__media');
    if (!prev) return;
    if (prev.tagName.toLowerCase() === 'video') {
      prev.pause();
      prev.removeAttribute('src');
      prev.load?.();
    }
    wrap.innerHTML = '';
  }

  function scrollThumbIntoView(idx) {
    const overlay = document.querySelector('.zoom-overlay');
    if (!overlay) return;
    const thumbs = overlay.querySelector('.zoom-overlay__thumbs');
    const active = thumbs?.querySelector(`[data-index="${idx}"]`);
    if (!active || !thumbs) return;
    const aRect = active.getBoundingClientRect();
    const tRect = thumbs.getBoundingClientRect();
    if (aRect.left < tRect.left || aRect.right > tRect.right) {
      thumbs.scrollTo({ left: active.offsetLeft - 16, behavior: 'smooth' });
    }
  }

  function updateThumbActive(idx) {
    const overlay = document.querySelector('.zoom-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.zoom-thumb').forEach(el => {
      el.classList.toggle('is-active', Number(el.dataset.index) === idx);
    });
    scrollThumbIntoView(idx);
  }

  function renderAt(index) {
    if (!mediaList.length) return;
    if (index < 0) index = mediaList.length - 1;
    if (index >= mediaList.length) index = 0;
    currentIndex = index;

    const srcEl = mediaList[currentIndex];
    const overlay = document.querySelector('.zoom-overlay');
    if (!overlay) return;

    const mediaWrap = overlay.querySelector('.zoom-overlay__wrap');
    const captionEl = overlay.querySelector('.zoom-overlay__caption');

    destroyMediaIn(mediaWrap);

    let media;
    if (srcEl.tagName.toLowerCase() === 'video') {
      media = document.createElement('video');
      media.src = srcEl.currentSrc || srcEl.src;
      media.controls = true;
      media.autoplay = true;
      media.playsInline = true;
    } else {
      media = document.createElement('img');
      media.src = srcEl.currentSrc || srcEl.src;
      media.alt = srcEl.alt || '';
    }
    media.className = 'zoom-overlay__media';
    mediaWrap.appendChild(media);

    const cap = captionFor(srcEl);
    captionEl.textContent = cap || '';
    captionEl.style.display = cap ? '' : 'none';

    updateThumbActive(currentIndex);
  }

  function closeOverlay() {
    const overlay = document.querySelector('.zoom-overlay');
    if (!overlay) return;
    document.removeEventListener('keydown', overlay.__onKey);
    destroyMediaIn(overlay.querySelector('.zoom-overlay__wrap'));
    overlay.remove();
    document.body.classList.remove('zoom-open');
    currentIndex = -1;
  }

  const showNext = () => renderAt(currentIndex + 1);
  const showPrev = () => renderAt(currentIndex - 1);

  function buildThumb(el, idx) {
    const isVideo = el.tagName.toLowerCase() === 'video';
    const btn = document.createElement('button');
    btn.className = 'zoom-thumb';
    btn.type = 'button';
    btn.dataset.index = String(idx);
    btn.setAttribute('aria-label', `View media ${idx + 1}`);

    let thumb;
    if (isVideo) {
      thumb = document.createElement('video');
      thumb.src = el.currentSrc || el.src;
      thumb.muted = true;
      thumb.playsInline = true;
      thumb.loop = true;
      thumb.autoplay = true; // silent preview
      thumb.className = 'zoom-thumb__media';
      const badge = document.createElement('span');
      badge.className = 'zoom-thumb__badge';
      badge.textContent = '▶';
      btn.appendChild(thumb);
      btn.appendChild(badge);
    } else {
      thumb = document.createElement('img');
      thumb.src = el.currentSrc || el.src;
      thumb.alt = el.alt || '';
      thumb.loading = 'lazy';
      thumb.decoding = 'async';
      thumb.className = 'zoom-thumb__media';
      btn.appendChild(thumb);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderAt(idx);
    });
    return btn;
  }

  function buildOverlay(startIndex) {
    const overlay = document.createElement('div');
    overlay.className = 'zoom-overlay';
    overlay.tabIndex = -1;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'zoom-overlay__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    // Left / right click zones for navigation
    const navLeft  = document.createElement('div');
    const navRight = document.createElement('div');
    navLeft.className  = 'zoom-overlay__nav zoom-overlay__nav--left';
    navRight.className = 'zoom-overlay__nav zoom-overlay__nav--right';

    const inner = document.createElement('div');
    inner.className = 'zoom-overlay__inner';

    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'zoom-overlay__wrap';

    const captionEl = document.createElement('div');
    captionEl.className = 'zoom-overlay__caption';

    // --- Thumbnail strip (bottom) ---
    const thumbsWrap = document.createElement('div');
    thumbsWrap.className = 'zoom-overlay__thumbs';
    const track = document.createElement('div');
    track.className = 'zoom-overlay__thumbs-track';
    thumbsWrap.appendChild(track);

    // Build thumbs from current mediaList
    mediaList.forEach((el, idx) => {
      track.appendChild(buildThumb(el, idx));
    });

    inner.appendChild(mediaWrap);
    inner.appendChild(captionEl);
    inner.appendChild(thumbsWrap);

    overlay.appendChild(navLeft);
    overlay.appendChild(navRight);
    overlay.appendChild(closeBtn);
    overlay.appendChild(inner);

    document.body.appendChild(overlay);
    document.body.classList.add('zoom-open');

    // Interactions
    closeBtn.addEventListener('click', closeOverlay);

    // Clicking backdrop (outside inner) closes
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });

    // Nav zones
    navLeft.addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });
    navRight.addEventListener('click', (e) => { e.stopPropagation(); showNext(); });

    // Keys
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); showNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); showPrev(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); }
    };
    document.addEventListener('keydown', onKey);
    overlay.__onKey = onKey;

    overlay.focus();
    renderAt(startIndex);
  }

  // Delegate clicks on media to open
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const media = e.target.closest(SELECTOR_MEDIA);
    if (!media) return;
    if (media.closest('a, .internal-link')) return; // let links behave

    e.preventDefault();
    collectMedia();
    const startIndex = mediaList.indexOf(media);
    if (startIndex === -1) return;
    buildOverlay(startIndex);
  });
})();