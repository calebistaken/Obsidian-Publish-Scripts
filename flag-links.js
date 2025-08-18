// =============================================================
// Country Flag Superscript Script for Obsidian Publish
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

// Utility: normalize text
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, ""); // remove accents
}

// Utility: extract country-like part from address
function extractCountry(address) {
  if (!address) return null;
  const parts = address.split(",").map(p => p.trim());
  return parts[parts.length - 1] || null;
}

// Main insertion
function insertFlag() {
  const fm = document.querySelector(".frontmatter");
  if (!fm) return;

  const addressToken = fm.querySelector(".token.key:contains('address') + .token.string");
  const h1 = document.querySelector("h1");
  if (!addressToken || !h1) return;

  const address = addressToken.textContent.replace(/['"]/g, "").trim();
  let countryText = extractCountry(address);
  let flag = "";

  if (window.FLAG_FORCE_FALLBACK) {
    flag = window.FLAG_FALLBACK;
  } else if (countryText) {
    const norm = normalize(countryText);
    flag = FLAG_MAP[norm] || window.FLAG_FALLBACK;
  } else {
    flag = window.FLAG_FALLBACK;
  }

  if (flag) {
    const sup = document.createElement("sup");
    sup.className = "flag-superscript";
    sup.textContent = flag;
    h1.appendChild(sup);
  }
}

// Run after DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", insertFlag);
} else {
  insertFlag();
}