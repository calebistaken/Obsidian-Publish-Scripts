/***
<script>
// Point to your repo once (no trailing slash)
setImportBase("https://cdn.jsdelivr.net/gh/yourname/yourrepo");

// Optional: pin an immutable commit/tag for all ghPath() URLs
setImportCommit("6b1d8d9");   // or "" to omit @commit

// Optional: add browser cache-busting to all requests
setImportVersion("6b1d8d9");  // or "" to omit ?v=

// Load assets (ghPath builds the jsDelivr URL using base + @commit + path)
await importScript([
  ghPath("css/base.css"),
  ghPath("css/dark.css"),
  ghPath("scripts/lightbox.js"),
  ghPath("scripts/shortcodes.mjs"),  // auto module
]);

// Ordered (dependency-safe)
await importScript.series([
  ghPath("vendor/lib.js"),
  ghPath("scripts/depends-on-lib.js")
]);

// Force types if needed
await importScript(ghPath("styles/print"), { type: "css" });
await importScript(ghPath("scripts/app.js"), { type: "module" });

// You can also use full URLs directly (still gets ?v=version if set)
await importScript("https://example.com/thing.css");
</script>
***/


// publish-imports.js
(() => {
  // ---------- Config ----------
  const CFG = {
    base:   "",   // e.g. "https://cdn.jsdelivr.net/gh/yourname/yourrepo"
    commit: "",   // e.g. "6b1d8d9" (tag or commit). If empty, omit @commit
    version:"",   // e.g. "6b1d8d9" (browser cache-bust). If empty, omit ?v=
  };

  // Public setters (safe to call early in publish.js)
  window.setImportBase    = (base) => (CFG.base = String(base || "").replace(/\/+$/,""));
  window.setImportCommit  = (commit) => (CFG.commit = String(commit || ""));
  window.setImportVersion = (version)=> (CFG.version = String(version || ""));

  // Helper to build jsDelivr GH URL from a repo-relative path
  // If you pass a full URL to importScript, it will be used as-is (only ?v added if set).
  window.ghPath = (path) => {
    if (!CFG.base) throw new Error("setImportBase('<jsDelivr GH base>') must be set before ghPath()");
    const p = String(path || "").replace(/^\/+/, "");
    const at = CFG.commit ? `@${CFG.commit}` : "";
    return `${CFG.base}${at}/${p}`;
  };

  // ---------- Internal helpers ----------
  const registry = new Map(); // key -> {promise, el}

  const normalize = (u) => new URL(u, document.baseURI).href;

  const addVersion = (href) => {
    if (!CFG.version) return href;
    const url = new URL(href, document.baseURI);
    if (!url.searchParams.has("v")) url.searchParams.set("v", CFG.version);
    return url.href;
  };

  const detectType = (href, explicit) => {
    if (explicit) return explicit;
    const lower = href.split("?")[0].toLowerCase();
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".mjs")) return "module";
    if (lower.endsWith(".js"))  return "js";
    return "js";
  };

  const wrapCss = (link) => ({
    type: "css",
    href: link.href,
    element: link,
    enable()  { link.disabled = false; return this; },
    disable() { link.disabled = true;  return this; },
    unload()  { link.remove(); }
  });

  const wrapJs = (script) => ({
    type: script.type === "module" ? "module" : "js",
    href: script.src || "(inline)",
    element: script,
    unload() { script.remove(); } // (doesn't undo executed code)
  });

  const mount = (el, prepend) => (prepend ? document.head.prepend(el) : document.head.append(el));

  // Build a final URL from either a full URL or ghPath-like repo path
  const toUrl = (input) => {
    // If it looks absolute (scheme:// or //), use as-is; else treat as relative to baseURI
    // ghPath already returns absolute; this also supports raw full URLs directly.
    try { return new URL(input).href; } catch { return new URL(input, document.baseURI).href; }
  };

  async function loadOne(inputUrl, opts = {}) {
    const {
      type,           // "css" | "js" | "module" (auto by extension if omitted)
      async = true,   // for classic JS
      defer = true,   // for classic JS
      module = false, // force module for .js (or use type:"module")
      media,
      integrity, crossOrigin, referrerPolicy, nonce,
      prepend = false
    } = opts;

    // Build URL and apply version param if requested
    // If inputUrl came from ghPath(), it's already absolute and may include @commit
    const absolute = toUrl(String(inputUrl));
    const finalHref = addVersion(absolute);
    const key = normalize(finalHref);
    const assetType = detectType(finalHref, type);

    // Deduping
    if (registry.has(key)) return registry.get(key).promise;

    // Reuse existing DOM element if present
    if (assetType === "css") {
      const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .find(l => normalize(l.href) === key);
      if (existing) {
        const promise = existing.sheet
          ? Promise.resolve(wrapCss(existing))
          : new Promise((res, rej) => {
              existing.addEventListener("load", () => res(wrapCss(existing)), { once: true });
              existing.addEventListener("error", () => rej(new Error(`Failed CSS: ${key}`)), { once: true });
            });
        registry.set(key, { promise, el: existing });
        return promise;
      }
    } else {
      const existing = [...document.querySelectorAll('script[src]')]
        .find(s => normalize(s.src) === key);
      if (existing) {
        const promise = new Promise((res, rej) => {
          if (existing.dataset.loaded === "1") return res(wrapJs(existing));
          existing.addEventListener("load", () => res(wrapJs(existing)), { once: true });
          existing.addEventListener("error", () => rej(new Error(`Failed JS: ${key}`)), { once: true });
        });
        registry.set(key, { promise, el: existing });
        return promise;
      }
    }

    // Create fresh element
    let el, promise;
    if (assetType === "css") {
      el = document.createElement("link");
      el.rel = "stylesheet";
      el.href = finalHref;
      if (media) el.media = media;
      if (integrity) el.integrity = integrity;
      if (crossOrigin) el.crossOrigin = crossOrigin;
      if (referrerPolicy) el.referrerPolicy = referrerPolicy;
      if (nonce) el.nonce = nonce;

      promise = new Promise((res, rej) => {
        el.addEventListener("load", () => res(wrapCss(el)), { once: true });
        el.addEventListener("error", () => {
          registry.delete(key);
          el.remove();
          rej(new Error(`Failed CSS: ${key}`));
        }, { once: true });
      });

      mount(el, prepend);
    } else {
      el = document.createElement("script");
      el.src = finalHref;
      if (nonce) el.nonce = nonce;
      if (integrity) el.integrity = integrity;
      if (crossOrigin) el.crossOrigin = crossOrigin;
      if (referrerPolicy) el.referrerPolicy = referrerPolicy;

      const isModule = (assetType === "module") || module;
      if (isModule) {
        el.type = "module"; // modules are async by default
      } else {
        if (defer) el.defer = true;
        else if (async) el.async = true;
      }

      promise = new Promise((res, rej) => {
        el.addEventListener("load", () => { el.dataset.loaded = "1"; res(wrapJs(el)); }, { once: true });
        el.addEventListener("error", () => {
          registry.delete(key);
          el.remove();
          rej(new Error(`Failed JS: ${key}`));
        }, { once: true });
      });

      mount(el, prepend);
    }

    registry.set(key, { promise, el });
    return promise;
  }

  // Public API
  async function importScript(urlOrList, opts = {}) {
    if (Array.isArray(urlOrList)) return Promise.all(urlOrList.map(u => loadOne(u, opts)));
    return loadOne(urlOrList, opts);
  }

  importScript.series = async (urls, opts = {}) => {
    const out = [];
    for (const u of urls) out.push(await loadOne(u, opts));
    return out;
  };

  importScript.css = (url, opts = {}) => loadOne(url, { ...opts, type: "css" });

  importScript.unload = (url) => {
    const key = normalize(addVersion(toUrl(String(url))));
    const rec = registry.get(key);
    if (rec) {
      rec.el.remove();
      registry.delete(key);
      return true;
    }
    return false;
  };

  window.importScript = importScript;
})();