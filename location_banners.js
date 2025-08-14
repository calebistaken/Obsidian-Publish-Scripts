(() => {
  // Load Leaflet CSS
  if (!document.querySelector('link[href*="leaflet.css"]')) {
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletCSS);
  }

  // Load Leaflet JS and then init map
  const loadLeafletAndInit = () => {
    if (window.L) {
      initMap();
    } else {
      const leafletScript = document.createElement('script');
      leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      leafletScript.onload = initMap;
      document.body.appendChild(leafletScript);
    }
  };

  // Function to create map once Leaflet is ready
  function initMap() {
    // Adjust this selector to find your hidden map link container in DOM
    const mapLinkSpan = document.querySelector('span.token.important');

    if (!mapLinkSpan) return; // No map link found

    const urlText = mapLinkSpan.textContent.trim();
    // Expect urlText like: query=28.6314022%2C77.2193791
    const queryMatch = urlText.match(/query=([\d.-]+)%2C([\d.-]+)/);
    if (!queryMatch) return; // No lat/lon found

    const lat = parseFloat(queryMatch[1]);
    const lon = parseFloat(queryMatch[2]);

    // Find the insertion point div.mod-header.mod-ui
    const headerDiv = document.querySelector('div.mod-header.mod-ui');
    if (!headerDiv) return;

    // Create container for map
    const mapDiv = document.createElement('div');
    mapDiv.style.width = '100%';
    mapDiv.style.height = '200px';
    mapDiv.style.marginBottom = '1em'; // spacing below map

    // Insert mapDiv right before headerDiv
    headerDiv.parentNode.insertBefore(mapDiv, headerDiv);

    // Initialize Leaflet map
    const map = L.map(mapDiv).setView([lat, lon], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    L.marker([lat, lon]).addTo(map);
  }

  // Start loading Leaflet and init
  loadLeafletAndInit();
})();