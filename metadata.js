// =============================================================
// Obsidian Publish: Flag + Monospace Meta Block from Frontmatter
// =============================================================

// Configurable globals
window.FLAG_FALLBACK = window.FLAG_FALLBACK || "🌍";   // default world symbol
window.FLAG_FORCE_FALLBACK = window.FLAG_FORCE_FALLBACK || false;

// Expanded country + alias dictionary
const FLAG_MAP = {
  // Americas
  "costa rica": "🇨🇷",
  "honduras": "🇭🇳",
  "nicaragua": "🇳🇮",
  "panama": "🇵🇦",
  "el salvador": "🇸🇻",
  "united states": "🇺🇸",
  "usa": "🇺🇸",
  "us": "🇺🇸",
  "america": "🇺🇸",
  "u.s.": "🇺🇸",
  "u.s.a.": "🇺🇸",

  // Europe
  "england": "🇬🇧",
  "uk": "🇬🇧",
  "u.k.": "🇬🇧",
  "united kingdom": "🇬🇧",
  "great britain": "🇬🇧",
  "france": "🇫🇷",
  "italy": "🇮🇹",
  "italia": "🇮🇹",
  "germany": "🇩🇪",
  "deutschland": "🇩🇪",
  "czech republic": "🇨🇿",
  "czechia": "🇨🇿",
  "cesko": "🇨🇿",
  "austria": "🇦🇹",
  "hungary": "🇭🇺",
  "poland": "🇵🇱",
  "finland": "🇫🇮",
  "estonia": "🇪🇪",
  "russia": "🇷🇺",
  "россия": "🇷🇺",
  "spain": "🇪🇸",
  "españa": "🇪🇸",
  "sweden": "🇸🇪",
  "norway": "🇳🇴",
  "denmark": "🇩🇰",
  "netherlands": "🇳🇱",
  "holland": "🇳🇱",
  "amsterdam": "🇳🇱",
  "belgium": "🇧🇪",
  "brussels": "🇧🇪",

  // Asia
  "china": "🇨🇳",
  "中国": "🇨🇳",
  "india": "🇮🇳",
  "bharat": "🇮🇳",
  "south korea": "🇰🇷",
  "republic of korea": "🇰🇷",
  "korea": "🇰🇷",
};

// ---------- Utilities ----------
function normalize(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // remove accents
}

// Find a frontmatter value (string or link) by key label
function getFrontmatterEntry(keyName) {
  const fm = document.querySelector(".frontmatter");
  if (!fm) return null;

  const keys = Array.from(fm.querySelectorAll(".token.key"));
  const keyEl = keys.find(k => normalize(k.textContent.trim()) === normalize(keyName));
  if (!keyEl) return null;

  // Value can be the next .token.string OR an <a> (Publish often renders links)
  let el = keyEl.nextElementSibling;
  while (el && !el.classList?.contains("string") && el.tagName !== "A") {
    el = el.nextElementSibling;
  }

  if (!el) return null;

  if (el.tagName === "A") {
    return { type: "link", text: el.textContent.replace(/['"]/g, "").trim(), href: el.getAttribute("href") };
  } else {
    // .token.string
    return { type: "string", text: el.textContent.replace(/['"]/g, "").trim(), href: null };
  }
}

// Extract country (last comma-part)
function extractCountry(address) {
  if (!address) return null;
  const parts = address.split(",").map(p => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || null;
}

// Detect US-like ZIP-ish codes (avoid using them as the "last piece")
function isZipish(str) {
  if (!str) return false;
  const s = str.trim();
  // US ZIP or ZIP+4, or just 4–6 consecutive digits (loose catch-all)
  return /^\d{5}(-\d{4})?$/.test(s) || /^\d{4,6}$/.test(s);
}

// Build display location: first part + last non-ZIP part
function buildLocationDisplay(address) {
  if (!address) return null;
  const parts = address.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0];
  // Walk from end to find last non-zip
  let tail = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!isZipish(parts[i])) { tail = parts[i]; break; }
  }
  // If everything looked like a zip (unlikely), fall back to last
  if (!tail) tail = parts[parts.length - 1];

  // If tail equals first (e.g., single-part address), just return first
  if (normalize(first) === normalize(tail)) return first;

  return `${first}, ${tail}`;
}

// Resolve flag from country (or fallback)
function resolveFlag(countryText) {
  if (window.FLAG_FORCE_FALLBACK) return window.FLAG_FALLBACK;
  if (!countryText) return window.FLAG_FALLBACK;
  const norm = normalize(countryText);
  return FLAG_MAP[norm] || window.FLAG_FALLBACK;
}

// ---------- Main renderers ----------
function insertFlagSuperscript(flag) {
  const h1 = document.querySelector("h1");
  if (!h1 || !flag) return;

  // Prevent duplicates
  if (h1.querySelector(".flag-superscript")) return;

  const sup = document.createElement("sup");
  sup.className = "flag-superscript";
  sup.textContent = flag;
  h1.appendChild(sup);
}

function insertMonospaceMeta({ author, addressText, addressHref, dates, flag }) {
  const h1 = document.querySelector("h1");
  if (!h1) return;

  // Prevent duplicates
  if (document.querySelector(".meta-mono-block")) return;

  const block = document.createElement("div");
  block.className = "meta-mono-block";
  block.style.fontFamily = "var(--font-monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)";
  block.style.fontSize = "0.95em";
  block.style.lineHeight = "1.4";
  block.style.marginTop = "0.35rem";
  block.style.whiteSpace = "pre-wrap";

  const lines = [];

  if (author) lines.push(`Author: ${author}`);

  if (addressText) {
    // “[flag] Location ↗” as a link
    const locLine = document.createElement("div");
    locLine.append("Location: ");
    const a = document.createElement("a");
    a.className = "meta-location-link";
    a.textContent = `${flag ? (flag + " ") : ""}${addressText} ↗`;
    if (addressHref) a.setAttribute("href", addressHref);
    a.setAttribute("rel", "noopener");
    a.setAttribute("target", "_blank");
    // If no href available, leave it unlinked but keep text
    locLine.appendChild(a);
    block.appendChild(locLine);
  }

  if (dates) lines.push(`Date: ${dates}`);

  if (lines.length) {
    const others = document.createElement("div");
    others.textContent = lines.join("\n");
    block.appendChild(others);
  }

  // Insert immediately after H1
  if (h1.nextSibling) {
    h1.parentNode.insertBefore(block, h1.nextSibling);
  } else {
    h1.parentNode.appendChild(block);
  }
}

// ---------- Orchestrator ----------
function run() {
  const fm = document.querySelector(".frontmatter");
  const h1 = document.querySelector("h1");
  if (!fm || !h1) return;

  // Gather frontmatter fields
  const authorEntry = getFrontmatterEntry("author");
  const addressEntry = getFrontmatterEntry("address");
  const dateEntry = getFrontmatterEntry("date") || getFrontmatterEntry("dates");

  const author = authorEntry?.text || "";
  // Address text: prefer the explicit text content; fall back to link text
  const rawAddressText = addressEntry?.text || "";
  const addressHref = addressEntry?.href || null;

  const countryText = extractCountry(rawAddressText);
  const flag = resolveFlag(countryText);

  // Insert superscript flag at H1 (kept from your original behavior)
  insertFlagSuperscript(flag);

  // Build display location (first part + last non-zip)
  const locationDisplay = buildLocationDisplay(rawAddressText);

  // Date(s)
  const dates = dateEntry?.text || "";

  // Insert monospace block
  insertMonospaceMeta({
    author,
    addressText: locationDisplay,
    addressHref,
    dates,
    flag
  });
}

// Run after DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}