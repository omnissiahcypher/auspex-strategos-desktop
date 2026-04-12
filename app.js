/* =====================================================
   HexGlobe — H3 Hexagonal 3D World Map
   
   Rendering approach:
   - MapLibre native GeoJSON layers for all geo features:
     • Points (circle + symbol) for cities, airports, etc.
     • Lines for pipelines, railways, roads
   - deck.gl only for H3 hex overlays and satellite orbits
   - h3-js for hexagonal indexing
   - satellite.js for LEO orbit propagation
   - CelesTrak GP data for satellite TLEs
   ===================================================== */

(function () {
  'use strict';

  // ── Config ──
  const TERRAIN_TILES = 'https://demotiles.maplibre.org/terrain-tiles/tiles.json';

  function buildStyle(dark) {
    const halo = dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
    const vis = id => layerState[id] ? 'visible' : 'none';

    return {
      version: 8,
      name: dark ? 'HexGlobe Dark' : 'HexGlobe Light',
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        osm: {
          type: 'raster',
          tiles: [dark
            ? 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
            : 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'],
          tileSize: 256,
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxzoom: 19
        },

        // GeoJSON sources embedded in style. Deep-copy data to prevent MapLibre
        // worker from mutating the source objects (causes tile errors on reload).
        'cities-src': { type: 'geojson', data: JSON.parse(JSON.stringify(CITIES_GEOJSON)) },
        'airports-src': { type: 'geojson', data: JSON.parse(JSON.stringify(AIRPORTS_GEOJSON)) },
        'ports-src': { type: 'geojson', data: JSON.parse(JSON.stringify(PORTS_GEOJSON)) },
        'refineries-src': { type: 'geojson', data: JSON.parse(JSON.stringify(REFINERIES_GEOJSON)) },
        'rare-earth-src': { type: 'geojson', data: JSON.parse(JSON.stringify(RARE_EARTH_GEOJSON)) },
        'mining-src': { type: 'geojson', data: JSON.parse(JSON.stringify(MINING_GEOJSON)) },
        'powerplants-src': { type: 'geojson', data: JSON.parse(JSON.stringify(POWERPLANTS_GEOJSON)) },
        'pipelines-src': { type: 'geojson', data: JSON.parse(JSON.stringify(PIPELINES_GEOJSON)) },
        'railways-src': { type: 'geojson', data: JSON.parse(JSON.stringify(RAILWAYS_GEOJSON)) },
        'roads-src': { type: 'geojson', data: JSON.parse(JSON.stringify(ROADS_GEOJSON)) }
      },
      layers: [
        { id: 'osm', type: 'raster', source: 'osm' },
        // ── Line layers ──
        { id: 'roads-line', type: 'line', source: 'roads-src',
          layout: { 'line-cap': 'round', 'line-join': 'round', visibility: vis('roads') },
          paint: { 'line-color': '#f0c674', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 6, 3, 10, 5],
                   'line-opacity': 0.8, 'line-dasharray': [2, 1] } },
        { id: 'roads-label', type: 'symbol', source: 'roads-src',
          layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'name'], 'text-size': 10,
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-allow-overlap': false, visibility: vis('roads') },
          paint: { 'text-color': '#f0c674', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        { id: 'railways-line', type: 'line', source: 'railways-src',
          layout: { 'line-cap': 'butt', 'line-join': 'round', visibility: vis('railways') },
          paint: { 'line-color': '#bc8cff', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 6, 2.5, 10, 4],
                   'line-opacity': 0.85, 'line-dasharray': [4, 2] } },
        { id: 'railways-casing', type: 'line', source: 'railways-src',
          layout: { 'line-cap': 'butt', 'line-join': 'round', visibility: vis('railways') },
          paint: { 'line-color': '#bc8cff', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 6, 1, 10, 1.5],
                   'line-opacity': 0.4, 'line-gap-width': ['interpolate', ['linear'], ['zoom'], 2, 3, 6, 5, 10, 8] } },
        { id: 'railways-label', type: 'symbol', source: 'railways-src',
          layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'name'], 'text-size': 10,
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-allow-overlap': false, visibility: vis('railways') },
          paint: { 'text-color': '#bc8cff', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        { id: 'pipelines-line', type: 'line', source: 'pipelines-src',
          layout: { 'line-cap': 'round', 'line-join': 'round', visibility: vis('pipelines') },
          paint: { 'line-color': '#f85149', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2, 6, 3.5, 10, 6],
                   'line-opacity': 0.85 } },
        { id: 'pipelines-label', type: 'symbol', source: 'pipelines-src',
          layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'name'], 'text-size': 10,
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-allow-overlap': false, visibility: vis('pipelines') },
          paint: { 'text-color': '#f85149', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        // ── Point layers ──
        { id: 'cities-circle', type: 'circle', source: 'cities-src',
          layout: { visibility: vis('cities') },
          paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'pop'], 2000, 4, 10000, 7, 25000, 12],
                   'circle-color': '#e0e0e0', 'circle-opacity': 0.85,
                   'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.9 } },
        { id: 'cities-label', type: 'symbol', source: 'cities-src',
          layout: { 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['get', 'pop'], 2000, 11, 15000, 14],
                    'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                    'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-allow-overlap': false,
                    visibility: vis('cities') },
          paint: { 'text-color': '#e0e0e0', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        { id: 'airports-circle', type: 'circle', source: 'airports-src',
          layout: { visibility: vis('airports') },
          paint: { 'circle-radius': 6, 'circle-color': '#58a6ff', 'circle-opacity': 0.9,
                   'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
        { id: 'airports-label', type: 'symbol', source: 'airports-src',
          layout: { 'text-field': ['get', 'iata'], 'text-size': 11,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': false,
                    visibility: vis('airports') },
          paint: { 'text-color': '#58a6ff', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        { id: 'ports-circle', type: 'circle', source: 'ports-src',
          layout: { visibility: vis('ports') },
          paint: { 'circle-radius': 5.5, 'circle-color': '#3fb8af', 'circle-opacity': 0.9,
                   'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } },
        { id: 'ports-label', type: 'symbol', source: 'ports-src',
          layout: { 'text-field': ['get', 'name'], 'text-size': 10,
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': false,
                    visibility: vis('ports') },
          paint: { 'text-color': '#3fb8af', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        { id: 'refineries-circle', type: 'circle', source: 'refineries-src',
          layout: { visibility: vis('refineries') },
          paint: { 'circle-radius': 5.5, 'circle-color': '#ff9500', 'circle-opacity': 0.9,
                   'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } },
        { id: 'refineries-label', type: 'symbol', source: 'refineries-src',
          layout: { 'text-field': ['get', 'name'], 'text-size': 10,
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': false,
                    visibility: vis('refineries') },
          paint: { 'text-color': '#ff9500', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        { id: 'rare-earth-outer', type: 'circle', source: 'rare-earth-src',
          layout: { visibility: vis('rare-earth') },
          paint: { 'circle-radius': 10, 'circle-color': 'rgba(210,168,255,0.15)', 'circle-opacity': 1,
                   'circle-stroke-color': '#d2a8ff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.6 } },
        { id: 'rare-earth-circle', type: 'circle', source: 'rare-earth-src',
          layout: { visibility: vis('rare-earth') },
          paint: { 'circle-radius': 5, 'circle-color': '#d2a8ff', 'circle-opacity': 0.9,
                   'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } },
        { id: 'rare-earth-label', type: 'symbol', source: 'rare-earth-src',
          layout: { 'text-field': ['concat', ['get', 'name'], '\n', ['get', 'mineral']],
                    'text-size': 10, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-allow-overlap': false,
                    visibility: vis('rare-earth') },
          paint: { 'text-color': '#d2a8ff', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        { id: 'mining-circle', type: 'circle', source: 'mining-src',
          layout: { visibility: vis('mining') },
          paint: { 'circle-radius': 5.5, 'circle-color': '#c9730a', 'circle-opacity': 0.9,
                   'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } },
        { id: 'mining-label', type: 'symbol', source: 'mining-src',
          layout: { 'text-field': ['concat', ['get', 'name'], '\n', ['get', 'mineral']],
                    'text-size': 10, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-allow-overlap': false,
                    visibility: vis('mining') },
          paint: { 'text-color': '#c9730a', 'text-halo-color': halo, 'text-halo-width': 1.5 } },
        { id: 'powerplants-circle', type: 'circle', source: 'powerplants-src',
          layout: { visibility: vis('powerplants') },
          paint: { 'circle-radius': 5.5, 'circle-color': '#ffd700', 'circle-opacity': 0.9,
                   'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } },
        { id: 'powerplants-label', type: 'symbol', source: 'powerplants-src',
          layout: { 'text-field': ['concat', ['get', 'name'], '\n', ['get', 'detail']],
                    'text-size': 10, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-allow-overlap': false,
                    visibility: vis('powerplants') },
          paint: { 'text-color': '#ffd700', 'text-halo-color': halo, 'text-halo-width': 1.5 } }
      ],
      // NOTE: terrain is applied programmatically via map.setTerrain() after load
      // to avoid a worker race with GeoJSON sources when raster-DEM tiles error.
      sky: {}
    };
  }

  // GeoJSON sources & layers are now embedded directly in buildStyle()
  // to avoid the MapLibre v5 + deck.gl worker race condition that occurs
  // when sources are added programmatically via addSource/addLayer.

  // ── Layer Definitions ──
  const LAYER_GROUPS = [
    {
      name: 'H3 Grid',
      layers: [
        { id: 'h3-grid', name: 'Hex Grid', color: '#00d4aa', active: true, type: 'h3' },
        { id: 'h3-elevation', name: 'Elevation Heatmap', color: '#ff6b35', active: false, type: 'h3data' },
        { id: 'h3-vegetation', name: 'Vegetation (NDVI)', color: '#2d8a4e', active: false, type: 'h3data' },
        { id: 'h3-hydrology', name: 'Hydrology', color: '#1f6feb', active: false, type: 'h3data' }
      ]
    },
    {
      name: 'Infrastructure',
      layers: [
        { id: 'roads', name: 'Roads & Highways', color: '#f0c674', active: false, type: 'line' },
        { id: 'cities', name: 'Cities & Towns', color: '#e0e0e0', active: true, type: 'point' },
        { id: 'airports', name: 'Airports', color: '#58a6ff', active: false, type: 'point' },
        { id: 'ports', name: 'Seaports', color: '#3fb8af', active: false, type: 'point' },
        { id: 'railways', name: 'Railways', color: '#bc8cff', active: false, type: 'line' }
      ]
    },
    {
      name: 'Energy & Resources',
      layers: [
        { id: 'pipelines', name: 'Oil Pipelines', color: '#f85149', active: false, type: 'line' },
        { id: 'refineries', name: 'Refineries', color: '#ff9500', active: false, type: 'point' },
        { id: 'rare-earth', name: 'Rare Earth Minerals', color: '#d2a8ff', active: false, type: 'point' },
        { id: 'mining', name: 'Mining Sites', color: '#c9730a', active: false, type: 'point' },
        { id: 'powerplants', name: 'Power Plants', color: '#ffd700', active: false, type: 'point' }
      ]
    },
    {
      name: 'Space',
      layers: [
        { id: 'satellites', name: 'LEO Satellites', color: '#00d4aa', active: false, type: 'satellites' },
        { id: 'sat-starlink', name: 'Starlink', color: '#58a6ff', active: false, type: 'satellites' },
        { id: 'sat-oneWeb', name: 'OneWeb', color: '#d2a8ff', active: false, type: 'satellites' }
      ]
    },
    {
      name: 'Environment',
      layers: [
        { id: 'terrain-3d', name: '3D Terrain', color: '#8b6d4b', active: true, type: 'terrain' },
        { id: 'land-cover', name: 'Land Cover', color: '#3fb950', active: false, type: 'h3data' },
        { id: 'ocean-depth', name: 'Ocean Bathymetry', color: '#0a3069', active: false, type: 'h3data' }
      ]
    }
  ];

  // ── State ──
  let map, deckOverlay;
  let currentRes = 3;
  let layerState = {};
  let satData = {};
  let selectedHex = null;
  let isDark = true;
  let tooltip = null;
  let satAnimFrame = null;
  let mapSourcesAdded = false;

  LAYER_GROUPS.forEach(g => g.layers.forEach(l => { layerState[l.id] = l.active; }));

  // ══════════════════════════════════════════════════════
  //  GEO DATA — Points (GeoJSON Features)
  // ══════════════════════════════════════════════════════

  function pt(coords, props) {
    return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coords } };
  }
  function line(coords, props) {
    return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } };
  }
  function fc(features) {
    return { type: 'FeatureCollection', features };
  }

  // ── Cities (Point) ──
  const CITIES_GEOJSON = fc([
    pt([-74.006, 40.7128], { name: 'New York', pop: 8336, rank: 1 }),
    pt([-0.1276, 51.5074], { name: 'London', pop: 8982, rank: 1 }),
    pt([139.6917, 35.6895], { name: 'Tokyo', pop: 13960, rank: 1 }),
    pt([2.3522, 48.8566], { name: 'Paris', pop: 2161, rank: 1 }),
    pt([116.4074, 39.9042], { name: 'Beijing', pop: 21540, rank: 1 }),
    pt([37.6173, 55.7558], { name: 'Moscow', pop: 12500, rank: 1 }),
    pt([72.8777, 19.076], { name: 'Mumbai', pop: 20411, rank: 1 }),
    pt([-46.6333, -23.5505], { name: 'São Paulo', pop: 12325, rank: 1 }),
    pt([31.2357, 30.0444], { name: 'Cairo', pop: 9540, rank: 1 }),
    pt([55.2708, 25.2048], { name: 'Dubai', pop: 3331, rank: 1 }),
    pt([151.2093, -33.8688], { name: 'Sydney', pop: 5312, rank: 1 }),
    pt([13.405, 52.52], { name: 'Berlin', pop: 3748, rank: 1 }),
    pt([103.8198, 1.3521], { name: 'Singapore', pop: 5686, rank: 1 }),
    pt([114.1694, 22.3193], { name: 'Hong Kong', pop: 7482, rank: 1 }),
    pt([126.978, 37.5665], { name: 'Seoul', pop: 9776, rank: 1 }),
    pt([-99.1332, 19.4326], { name: 'Mexico City', pop: 9209, rank: 1 }),
    pt([28.9784, 41.0082], { name: 'Istanbul', pop: 15460, rank: 1 }),
    pt([3.3792, 6.5244], { name: 'Lagos', pop: 15388, rank: 1 }),
    pt([-58.3816, -34.6037], { name: 'Buenos Aires', pop: 3075, rank: 1 }),
    pt([106.8456, -6.2088], { name: 'Jakarta', pop: 10560, rank: 1 }),
    pt([121.4737, 31.2304], { name: 'Shanghai', pop: 24870, rank: 1 }),
    pt([77.1025, 28.7041], { name: 'Delhi', pop: 16787, rank: 1 }),
    pt([-118.2437, 34.0522], { name: 'Los Angeles', pop: 3979, rank: 1 }),
    pt([-87.6298, 41.8781], { name: 'Chicago', pop: 2693, rank: 2 }),
    pt([-79.3832, 43.6532], { name: 'Toronto', pop: 2930, rank: 2 }),
    pt([36.8219, -1.2921], { name: 'Nairobi', pop: 4397, rank: 2 }),
    pt([-77.0428, -12.0464], { name: 'Lima', pop: 10882, rank: 2 }),
    pt([100.5018, 13.7563], { name: 'Bangkok', pop: 10539, rank: 1 }),
    pt([28.0473, -26.2041], { name: 'Johannesburg', pop: 5635, rank: 2 }),
    pt([46.6753, 24.7136], { name: 'Riyadh', pop: 7676, rank: 2 }),
    pt([51.389, 35.6892], { name: 'Tehran', pop: 8694, rank: 2 }),
    pt([44.3661, 33.3152], { name: 'Baghdad', pop: 7144, rank: 2 }),
    pt([-70.6693, -33.4489], { name: 'Santiago', pop: 6158, rank: 2 }),
    pt([101.6869, 3.139], { name: 'Kuala Lumpur', pop: 7780, rank: 2 }),
    pt([12.4964, 41.9028], { name: 'Rome', pop: 2873, rank: 2 }),
    pt([-3.7038, 40.4168], { name: 'Madrid', pop: 3223, rank: 2 }),
    pt([32.8597, 39.9334], { name: 'Ankara', pop: 5663, rank: 2 }),
    pt([-74.0721, 4.711], { name: 'Bogota', pop: 7181, rank: 2 }),
    pt([90.4125, 23.8103], { name: 'Dhaka', pop: 21006, rank: 2 }),
    pt([15.2663, -4.4419], { name: 'Kinshasa', pop: 14342, rank: 2 })
  ]);

  // ── Airports (Point) ──
  const AIRPORTS_GEOJSON = fc([
    pt([-73.7781, 40.6413], { name: 'JFK International', iata: 'JFK', city: 'New York' }),
    pt([-0.4543, 51.47], { name: 'Heathrow', iata: 'LHR', city: 'London' }),
    pt([139.7798, 35.5494], { name: 'Haneda', iata: 'HND', city: 'Tokyo' }),
    pt([2.5479, 49.0097], { name: 'Charles de Gaulle', iata: 'CDG', city: 'Paris' }),
    pt([55.3644, 25.2528], { name: 'Dubai International', iata: 'DXB', city: 'Dubai' }),
    pt([116.5975, 40.0799], { name: 'Beijing Capital', iata: 'PEK', city: 'Beijing' }),
    pt([-118.4085, 33.9416], { name: 'Los Angeles Intl', iata: 'LAX', city: 'Los Angeles' }),
    pt([-87.9048, 41.9742], { name: "O'Hare International", iata: 'ORD', city: 'Chicago' }),
    pt([103.9915, 1.3644], { name: 'Changi', iata: 'SIN', city: 'Singapore' }),
    pt([4.7638, 52.3105], { name: 'Schiphol', iata: 'AMS', city: 'Amsterdam' }),
    pt([8.5622, 50.0379], { name: 'Frankfurt', iata: 'FRA', city: 'Frankfurt' }),
    pt([126.4505, 37.4602], { name: 'Incheon', iata: 'ICN', city: 'Seoul' }),
    pt([151.1772, -33.9461], { name: 'Sydney Kingsford Smith', iata: 'SYD', city: 'Sydney' }),
    pt([100.7501, 13.69], { name: 'Suvarnabhumi', iata: 'BKK', city: 'Bangkok' }),
    pt([77.1025, 28.5562], { name: 'Indira Gandhi', iata: 'DEL', city: 'Delhi' }),
    pt([-46.473, -23.4356], { name: 'Guarulhos', iata: 'GRU', city: 'São Paulo' }),
    pt([28.8141, 41.2753], { name: 'Istanbul Airport', iata: 'IST', city: 'Istanbul' }),
    pt([28.246, -26.1367], { name: 'OR Tambo', iata: 'JNB', city: 'Johannesburg' }),
    pt([-99.0721, 19.4361], { name: 'Benito Juarez', iata: 'MEX', city: 'Mexico City' }),
    pt([37.9063, 55.4088], { name: 'Domodedovo', iata: 'DME', city: 'Moscow' })
  ]);

  // ── Seaports (Point) ──
  const PORTS_GEOJSON = fc([
    pt([121.80, 31.37], { name: 'Port of Shanghai', throughput: '47.3M TEU' }),
    pt([103.82, 1.26], { name: 'Port of Singapore', throughput: '37.2M TEU' }),
    pt([4.29, 51.89], { name: 'Port of Rotterdam', throughput: '14.5M TEU' }),
    pt([-118.27, 33.74], { name: 'Port of Los Angeles', throughput: '9.9M TEU' }),
    pt([129.07, 35.10], { name: 'Port of Busan', throughput: '21.7M TEU' }),
    pt([55.03, 25.01], { name: 'Jebel Ali', throughput: '13.5M TEU' }),
    pt([114.08, 22.47], { name: 'Port of Shenzhen', throughput: '25.8M TEU' }),
    pt([9.97, 53.53], { name: 'Port of Hamburg', throughput: '8.7M TEU' }),
    pt([4.39, 51.27], { name: 'Port of Antwerp', throughput: '12.0M TEU' }),
    pt([101.39, 3.00], { name: 'Port Klang', throughput: '13.2M TEU' })
  ]);

  // ── Refineries (Point) ──
  const REFINERIES_GEOJSON = fc([
    pt([70.07, 22.47], { name: 'Jamnagar Refinery', detail: '1.24M bpd', country: 'India' }),
    pt([-70.21, 11.75], { name: 'Paraguana Refinery', detail: '0.96M bpd', country: 'Venezuela' }),
    pt([129.31, 35.55], { name: 'Ulsan Refinery', detail: '0.84M bpd', country: 'South Korea' }),
    pt([-93.99, 29.87], { name: 'Port Arthur Refinery', detail: '0.63M bpd', country: 'USA' }),
    pt([52.73, 24.11], { name: 'Ruwais Refinery', detail: '0.92M bpd', country: 'UAE' }),
    pt([103.70, 1.27], { name: 'Jurong Island Refinery', detail: '0.59M bpd', country: 'Singapore' }),
    pt([50.16, 26.64], { name: 'Ras Tanura Refinery', detail: '0.55M bpd', country: 'Saudi Arabia' }),
    pt([-94.98, 29.74], { name: 'Baytown Refinery', detail: '0.58M bpd', country: 'USA' })
  ]);

  // ── Rare Earth Minerals (Point) ──
  const RARE_EARTH_GEOJSON = fc([
    pt([109.97, 41.78], { name: 'Bayan Obo', mineral: 'REE, Nb', country: 'China' }),
    pt([122.55, -28.77], { name: 'Mount Weld', mineral: 'REE', country: 'Australia' }),
    pt([-115.53, 35.48], { name: 'Mountain Pass', mineral: 'REE', country: 'USA' }),
    pt([-46.04, 60.97], { name: 'Ilímaussaq', mineral: 'REE, U', country: 'Greenland' }),
    pt([34.77, 67.89], { name: 'Lovozero', mineral: 'REE', country: 'Russia' }),
    pt([-46.94, -19.59], { name: 'Araxa', mineral: 'Nb, REE', country: 'Brazil' }),
    pt([18.83, -31.30], { name: 'Steenkampskraal', mineral: 'Monazite', country: 'South Africa' }),
    pt([-46.0, 61.0], { name: 'Kvanefjeld', mineral: 'REE, U, Zn', country: 'Greenland' }),
    pt([133.24, -22.59], { name: 'Nolans Bore', mineral: 'REE, P', country: 'Australia' }),
    pt([-64.15, 56.33], { name: 'Strange Lake', mineral: 'REE, Zr', country: 'Canada' }),
    pt([31.48, -4.32], { name: 'Ngualla', mineral: 'REE', country: 'Tanzania' }),
    pt([114.85, 24.72], { name: 'Longnan', mineral: 'Heavy REE', country: 'China' }),
    pt([103.80, 21.72], { name: 'Dong Pao', mineral: 'REE', country: 'Vietnam' }),
    pt([-60.08, -0.78], { name: 'Pitinga', mineral: 'Sn, Nb, REE', country: 'Brazil' }),
    pt([116.50, 71.00], { name: 'Tomtor', mineral: 'REE, Nb', country: 'Russia' }),
    pt([-49.15, -14.10], { name: 'Serra Verde', mineral: 'REE', country: 'Brazil' }),
    pt([128.97, -19.06], { name: 'Browns Range', mineral: 'Heavy REE', country: 'Australia' }),
    pt([17.95, -31.28], { name: 'Zandkopsdrift', mineral: 'REE', country: 'South Africa' })
  ]);

  // ── Mining Sites (Point) ──
  const MINING_GEOJSON = fc([
    pt([-69.07, -24.27], { name: 'Escondida', mineral: 'Copper', country: 'Chile' }),
    pt([137.12, -4.05], { name: 'Grasberg', mineral: 'Copper, Gold', country: 'Indonesia' }),
    pt([-109.37, 33.07], { name: 'Morenci', mineral: 'Copper', country: 'USA' }),
    pt([136.88, -30.44], { name: 'Olympic Dam', mineral: 'Cu, U, Au', country: 'Australia' }),
    pt([88.20, 69.35], { name: 'Norilsk', mineral: 'Nickel, Palladium', country: 'Russia' }),
    pt([-50.36, -6.08], { name: 'Carajás', mineral: 'Iron ore', country: 'Brazil' }),
    pt([118.77, -22.31], { name: 'Pilbara', mineral: 'Iron ore', country: 'Australia' }),
    pt([-65.75, -19.59], { name: 'Potosí', mineral: 'Silver, Tin', country: 'Bolivia' }),
    pt([24.53, -24.53], { name: 'Jwaneng', mineral: 'Diamonds', country: 'Botswana' }),
    pt([-68.90, -22.32], { name: 'Chuquicamata', mineral: 'Copper', country: 'Chile' })
  ]);

  // ── Power Plants (Point) ──
  const POWERPLANTS_GEOJSON = fc([
    pt([111.00, 30.82], { name: 'Three Gorges Dam', detail: 'Hydro · 22,500 MW' }),
    pt([-54.59, -25.41], { name: 'Itaipu Dam', detail: 'Hydro · 14,000 MW' }),
    pt([138.60, 37.43], { name: 'Kashiwazaki-Kariwa', detail: 'Nuclear · 7,965 MW' }),
    pt([-81.60, 44.33], { name: 'Bruce Nuclear', detail: 'Nuclear · 6,288 MW' }),
    pt([120.48, 24.21], { name: 'Taichung', detail: 'Coal · 5,824 MW' }),
    pt([73.38, 61.25], { name: 'Surgut-2', detail: 'Gas · 5,597 MW' }),
    pt([-62.97, 7.76], { name: 'Guri Dam', detail: 'Hydro · 10,235 MW' }),
    pt([19.33, 51.27], { name: 'Belchatow', detail: 'Coal · 5,354 MW' }),
    pt([95.50, 40.50], { name: 'Gansu Wind Farm', detail: 'Wind · 7,965 MW' }),
    pt([71.91, 27.54], { name: 'Bhadla Solar Park', detail: 'Solar · 2,245 MW' })
  ]);

  // ══════════════════════════════════════════════════════
  //  GEO DATA — Lines (GeoJSON LineStrings)
  // ══════════════════════════════════════════════════════

  // ── Oil Pipelines (LineString) ──
  const PIPELINES_GEOJSON = fc([
    line([[-145.5, 60.8], [-149.9, 64.8], [-148.3, 70.2]], { name: 'Trans-Alaska Pipeline' }),
    line([[-97.3, 29.7], [-97.5, 36.2], [-97.8, 42.8], [-104.6, 49.0]], { name: 'Keystone Pipeline' }),
    line([[52.5, 52.0], [40.5, 53.5], [30.5, 52.4], [24.0, 51.8], [18.0, 51.1], [14.4, 50.1]], { name: 'Druzhba Pipeline' }),
    line([[50.0, 40.4], [46.0, 41.7], [43.3, 41.0], [39.5, 39.7], [36.2, 36.8]], { name: 'BTC Pipeline' }),
    line([[73.4, 57.0], [82.9, 55.0], [92.9, 56.0], [104.3, 52.3], [131.9, 43.1]], { name: 'ESPO Pipeline' }),
    line([[17.0, 8.5], [14.0, 6.5], [10.5, 4.7], [9.7, 4.0]], { name: 'Chad-Cameroon Pipeline' }),
    line([[50.1, 26.4], [46.7, 24.7], [42.0, 24.0], [39.2, 21.5]], { name: 'East-West Pipeline' }),
    line([[30.0, 59.6], [24.0, 59.0], [18.0, 55.6], [12.1, 54.2]], { name: 'Nord Stream' }),
    line([[41.0, 42.5], [38.0, 42.0], [32.0, 42.5], [29.0, 41.5]], { name: 'TurkStream' }),
    line([[3.1, 36.7], [7.5, 37.5], [9.5, 37.0], [11.0, 37.5]], { name: 'Trans-Mediterranean Pipeline' }),
    line([[62.2, 36.5], [65.5, 33.5], [67.0, 30.2], [68.4, 25.4]], { name: 'TAPI Pipeline' })
  ]);

  // ── Railways (LineString) ──
  const RAILWAYS_GEOJSON = fc([
    line([[37.6, 55.75], [43.1, 56.33], [49.1, 56.32], [56.0, 56.8], [60.6, 56.8], [65.5, 57.15],
          [73.4, 57.0], [82.9, 55.0], [87.2, 53.7], [92.9, 56.0], [104.3, 52.3],
          [109.0, 51.8], [114.5, 50.3], [127.7, 50.2], [131.9, 43.1]], { name: 'Trans-Siberian Railway' }),
    line([[-73.9, 40.75], [-76.6, 39.3], [-77.04, 38.9], [-78.5, 37.5], [-79.9, 36.1],
          [-80.8, 35.2], [-81.7, 34.0], [-82.4, 33.7], [-84.4, 33.75]], { name: 'US East Coast Rail' }),
    line([[-0.12, 51.53], [-1.26, 51.75], [-2.58, 51.45], [-3.18, 51.48]], { name: 'Great Western Railway' }),
    line([[2.35, 48.85], [4.36, 48.95], [6.18, 48.69], [7.34, 48.08], [8.68, 50.11],
          [9.99, 48.78], [11.58, 48.14], [13.38, 52.52]], { name: 'Paris–Berlin Rail' }),
    line([[116.4, 39.9], [117.2, 39.1], [119.0, 36.6], [117.0, 34.3], [116.6, 32.9],
          [114.3, 30.6], [112.9, 28.2], [113.3, 23.1]], { name: 'Beijing–Guangzhou HSR' }),
    line([[139.7, 35.68], [137.0, 35.0], [135.5, 34.7], [131.5, 34.0], [130.4, 33.6]], { name: 'Shinkansen Tokaido-Sanyo' }),
    line([[37.6, 55.75], [30.3, 59.9], [24.9, 60.2]], { name: 'Moscow–Helsinki Rail' }),
    line([[28.98, 41.01], [32.86, 39.93], [36.0, 37.0], [39.5, 37.0], [43.0, 36.4], [44.4, 33.3]], { name: 'Baghdad Railway' }),
    line([[36.82, -1.29], [32.6, -0.3], [29.4, -1.5], [27.5, -2.5], [26.0, -4.3], [15.3, -4.44]], { name: 'East Africa Railway' }),
    line([[77.1, 28.7], [77.6, 26.9], [75.8, 26.9], [72.9, 19.1], [77.6, 13.0], [80.3, 13.1]], { name: 'Indian Railway Spine' }),
    line([[28.05, -26.2], [28.2, -25.7], [29.5, -23.9], [31.0, -22.0], [32.6, -25.97]], { name: 'South Africa Rail' }),
    line([[-46.6, -23.5], [-43.2, -22.9], [-38.5, -12.97], [-34.87, -8.05]], { name: 'Brazil Coastal Rail' })
  ]);

  // ── Roads / Highways (LineString) ──
  const ROADS_GEOJSON = fc([
    line([[-122.4, 37.8], [-121.9, 36.6], [-118.4, 34.0], [-117.2, 32.7]], { name: 'US Interstate 5 (CA)' }),
    line([[-74.0, 40.7], [-75.2, 39.95], [-77.0, 38.9], [-77.5, 37.5], [-78.6, 35.8],
          [-80.2, 33.5], [-80.1, 26.1]], { name: 'US Interstate 95' }),
    line([[-87.6, 41.9], [-90.2, 38.6], [-94.6, 39.1], [-97.3, 32.8],
          [-106.4, 31.8], [-110.9, 32.2], [-118.2, 34.0]], { name: 'US Interstate 10/40' }),
    line([[-0.12, 51.5], [1.2, 51.0], [2.35, 48.85], [4.35, 50.85],
          [6.96, 50.94], [8.68, 50.11], [13.4, 52.52]], { name: 'E40 Highway' }),
    line([[37.6, 55.75], [30.3, 59.93], [24.1, 56.95], [21.0, 56.95],
          [18.1, 59.33], [12.6, 55.67], [9.99, 53.55]], { name: 'E105/E20' }),
    line([[2.17, 41.39], [-3.7, 40.42], [-9.14, 38.74]], { name: 'Iberian Highway (AP-7/A-1)' }),
    line([[12.5, 41.9], [11.25, 43.77], [9.19, 45.46], [7.68, 45.07],
          [6.13, 46.2], [7.45, 46.95], [8.54, 47.38]], { name: 'Italian-Swiss Motorway' }),
    line([[116.4, 39.9], [121.5, 31.2], [120.2, 30.3], [113.3, 23.1]], { name: 'G2/G15 China Expressway' }),
    line([[139.7, 35.7], [136.9, 35.2], [135.5, 34.7], [130.4, 33.6]], { name: 'Meishin/Sanyo Expressway' }),
    line([[55.3, 25.25], [51.5, 25.3], [50.6, 26.2], [49.0, 26.5], [47.0, 29.3]], { name: 'Gulf Highway' }),
    line([[31.2, 30.04], [29.9, 31.2], [35.2, 31.8], [36.3, 33.9], [36.7, 34.4]], { name: 'Cairo-Beirut Highway' }),
    line([[36.8, -1.3], [39.3, -6.8], [32.6, -15.8], [28.3, -15.4], [28.0, -26.2]], { name: 'Cape to Cairo (Eastern)' }),
    line([[-46.6, -23.5], [-43.2, -22.9], [-38.5, -13.0], [-34.9, -8.1]], { name: 'BR-101 Brazil' }),
    line([[77.1, 28.7], [77.2, 22.3], [72.9, 19.1]], { name: 'NH-48 India' }),
    line([[28.0, -26.2], [25.7, -28.7], [18.4, -33.9]], { name: 'N1 South Africa' })
  ]);

  // ══════════════════════════════════════════════════════
  //  H3 Environmental Data Functions
  // ══════════════════════════════════════════════════════

  function hashH3(hex) {
    let h = 0;
    for (let i = 0; i < hex.length; i++) h = ((h << 5) - h + hex.charCodeAt(i)) | 0;
    return h;
  }

  function pseudoRandom(hex, seed) {
    const h = hashH3(hex) ^ seed;
    return ((Math.sin(h * 9301 + 49297) * 233280) % 1 + 1) % 1;
  }

  function getElevation(hex) {
    const [lat, lng] = h3.cellToLatLng(hex);
    const mf =
      Math.max(0, 1 - Math.abs(lat - 28) / 15) * Math.max(0, 1 - Math.abs(lng - 87) / 30) +
      Math.max(0, 1 - Math.abs(lat - 46) / 10) * Math.max(0, 1 - Math.abs(lng - 7) / 15) +
      Math.max(0, 1 - Math.abs(lat - 38) / 15) * Math.max(0, 1 - Math.abs(lng + 106) / 20) +
      Math.max(0, 1 - Math.abs(lat + 33) / 20) * Math.max(0, 1 - Math.abs(lng + 70) / 15);
    return Math.min(1, pseudoRandom(hex, 42) * 0.3 + mf * 0.7);
  }

  function getVegetation(hex) {
    const [lat] = h3.cellToLatLng(hex);
    const tropical = Math.max(0, 1 - Math.abs(lat) / 30) * 0.7;
    const temperate = Math.max(0, 1 - Math.abs(Math.abs(lat) - 50) / 20) * 0.5;
    const desert = (Math.abs(lat) > 15 && Math.abs(lat) < 35) ? 0.3 : 0;
    return Math.min(1, tropical + temperate - desert + pseudoRandom(hex, 7) * 0.2);
  }

  function getHydrology(hex) {
    const riverProx = pseudoRandom(hex, 123);
    return Math.min(1, riverProx * 0.5 + pseudoRandom(hex, 99) * 0.2);
  }

  function getLandCover(hex) {
    const v = getVegetation(hex), e = getElevation(hex);
    if (v > 0.6) return { type: 'Forest', value: v };
    if (e > 0.5) return { type: 'Mountain', value: e };
    if (v > 0.3) return { type: 'Grassland', value: v };
    if (v < 0.1) return { type: 'Desert/Barren', value: 1 - v };
    return { type: 'Mixed', value: 0.5 };
  }

  // ══════════════════════════════════════════════════════
  //  H3 Hex Grid (deck.gl)
  // ══════════════════════════════════════════════════════

  function getViewportHexes(res) {
    const bounds = map.getBounds();
    const center = map.getCenter();
    const maxHexes = 4000;
    const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
    const poly = [[sw.lat, sw.lng], [sw.lat, ne.lng], [ne.lat, ne.lng], [ne.lat, sw.lng], [sw.lat, sw.lng]];
    try {
      let hexes = h3.polygonToCells(poly, res, true);
      if (hexes.length > maxHexes) {
        const step = Math.ceil(hexes.length / maxHexes);
        hexes = hexes.filter((_, i) => i % step === 0);
      }
      return hexes;
    } catch (e) {
      const centerHex = h3.latLngToCell(center.lat, center.lng, res);
      return h3.gridDisk(centerHex, Math.min(Math.max(1, Math.floor(20 / (res + 1))), 5));
    }
  }

  function elevationColor(v) {
    if (v < 0.2) return [20, 80, 160, 160];
    if (v < 0.4) return [40, 160, 80, 160];
    if (v < 0.6) return [200, 200, 40, 160];
    if (v < 0.8) return [220, 100, 20, 160];
    return [255, 255, 255, 180];
  }
  function vegetationColor(v) { return [30 + (1 - v) * 100, 80 + v * 175, 30 + (1 - v) * 40, 140]; }
  function hydrologyColor(v) { return [10, 50 + v * 100, 150 + v * 105, 130 + v * 80]; }
  function landCoverColor(lc) {
    switch (lc.type) {
      case 'Forest': return [20, 120, 60, 150];
      case 'Mountain': return [140, 110, 80, 150];
      case 'Grassland': return [120, 160, 60, 140];
      case 'Desert/Barren': return [200, 180, 130, 140];
      default: return [100, 100, 80, 120];
    }
  }
  function oceanColor(v) { return [0, 20 + v * 30, 60 + v * 130, 100 + v * 60]; }

  // ══════════════════════════════════════════════════════
  //  Satellite Data
  // ══════════════════════════════════════════════════════

  async function loadSatellites(group) {
    if (satData[group]) return satData[group];
    const urls = {
      satellites: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
      'sat-starlink': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json',
      'sat-oneWeb': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=json'
    };
    try {
      const resp = await fetch(urls[group]);
      if (!resp.ok) throw new Error('Fetch failed');
      const data = await resp.json();
      const limited = data.slice(0, 200);
      const records = [];
      for (const sat of limited) {
        try {
          if (!sat.TLE_LINE1 || !sat.TLE_LINE2) continue;
          records.push({ name: sat.OBJECT_NAME, satrec: satellite.twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2), norad: sat.NORAD_CAT_ID });
        } catch (e) {}
      }
      satData[group] = records;
      return records;
    } catch (e) {
      const count = group === 'sat-starlink' ? 150 : group === 'sat-oneWeb' ? 80 : 100;
      const synthetic = [];
      for (let i = 0; i < count; i++) {
        synthetic.push({ name: `SAT-${group}-${i}`, synthetic: true, seed: i,
          inclination: 30 + Math.random() * 70, raan: Math.random() * 360, altitude: 300 + Math.random() * 1600 });
      }
      satData[group] = synthetic;
      return synthetic;
    }
  }

  function getSatPositions(records) {
    const now = new Date();
    const gmst = satellite.gstime(now);
    const positions = [];
    for (const rec of records) {
      try {
        if (rec.synthetic) {
          const t = now.getTime() / 1000;
          const period = 5400 + rec.seed * 10;
          const angle = ((t / period) * 360 + rec.raan) * Math.PI / 180;
          const incRad = rec.inclination * Math.PI / 180;
          const lat = Math.asin(Math.sin(incRad) * Math.sin(angle)) * 180 / Math.PI;
          const lng = (rec.raan + angle * 180 / Math.PI) % 360 - 180;
          positions.push({ name: rec.name, position: [lng, lat, rec.altitude * 1000], altitude: rec.altitude });
          continue;
        }
        const posVel = satellite.propagate(rec.satrec, now);
        if (!posVel.position) continue;
        const posGd = satellite.eciToGeodetic(posVel.position, gmst);
        positions.push({
          name: rec.name, norad: rec.norad,
          position: [satellite.degreesLong(posGd.longitude), satellite.degreesLat(posGd.latitude), posGd.height * 100],
          altitude: posGd.height
        });
      } catch (e) {}
    }
    return positions;
  }

  // ══════════════════════════════════════════════════════
  //  MapLibre Native GeoJSON Layers
  // ══════════════════════════════════════════════════════

  function addMapInteractions() {
    if (mapSourcesAdded) return;

    // ─── POPUPS ───
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px' });

    function addHover(layerId, htmlFn) {
      map.on('mouseenter', layerId, (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features[0];
        popup.setLngLat(e.lngLat).setHTML(htmlFn(f.properties)).addTo(map);
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
    }

    addHover('cities-circle', p => `<strong>${p.name}</strong><br>Pop: ${Number(p.pop).toLocaleString()}k`);
    addHover('airports-circle', p => `<strong>✈ ${p.name}</strong><br>${p.iata} · ${p.city}`);
    addHover('ports-circle', p => `<strong>⚓ ${p.name}</strong><br>${p.throughput}`);
    addHover('refineries-circle', p => `<strong>🏭 ${p.name}</strong><br>${p.country} · ${p.detail}`);
    addHover('rare-earth-circle', p => `<strong>💎 ${p.name}</strong><br>${p.country}<br>${p.mineral}`);
    addHover('mining-circle', p => `<strong>⛏ ${p.name}</strong><br>${p.country}<br>${p.mineral}`);
    addHover('powerplants-circle', p => `<strong>⚡ ${p.name}</strong><br>${p.detail}`);
    addHover('pipelines-line', p => `<strong>🛢 ${p.name}</strong>`);
    addHover('railways-line', p => `<strong>🚂 ${p.name}</strong>`);
    addHover('roads-line', p => `<strong>🛣 ${p.name}</strong>`);

    mapSourcesAdded = true;
  }

  // Map layer ID registry (for toggling visibility)
  const MAPLIBRE_LAYER_IDS = {
    cities: ['cities-circle', 'cities-label'],
    airports: ['airports-circle', 'airports-label'],
    ports: ['ports-circle', 'ports-label'],
    refineries: ['refineries-circle', 'refineries-label'],
    'rare-earth': ['rare-earth-outer', 'rare-earth-circle', 'rare-earth-label'],
    mining: ['mining-circle', 'mining-label'],
    powerplants: ['powerplants-circle', 'powerplants-label'],
    pipelines: ['pipelines-line', 'pipelines-label'],
    railways: ['railways-line', 'railways-casing', 'railways-label'],
    roads: ['roads-line', 'roads-label']
  };

  function setMapLayerVisibility(layerId, visible) {
    const ids = MAPLIBRE_LAYER_IDS[layerId];
    if (!ids) return;
    const vis = visible ? 'visible' : 'none';
    ids.forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
  }

  // ══════════════════════════════════════════════════════
  //  deck.gl Layers (H3 + Satellites only)
  // ══════════════════════════════════════════════════════

  function buildDeckLayers() {
    const layers = [];
    const hexes = getViewportHexes(currentRes);

    if (layerState['h3-grid']) {
      layers.push(new deck.H3HexagonLayer({
        id: 'h3-grid-layer', data: hexes.map(hex => ({ hex })),
        getHexagon: d => d.hex, filled: true, stroked: true, extruded: false,
        getFillColor: [0, 212, 170, 25], getLineColor: [0, 212, 170, 80],
        getLineWidth: 1, lineWidthUnits: 'pixels', pickable: true,
        autoHighlight: true, highlightColor: [0, 212, 170, 80],
        onClick: (info) => { if (info.object) selectHex(info.object.hex); },
        onHover: (info) => {
          if (info.object) showTooltip(info.x, info.y, info.object.hex);
          else hideTooltip();
        }
      }));
    }

    if (layerState['h3-elevation']) {
      layers.push(new deck.H3HexagonLayer({
        id: 'h3-elevation-layer', data: hexes.map(hex => ({ hex, value: getElevation(hex) })),
        getHexagon: d => d.hex, filled: true, stroked: false, extruded: true,
        getFillColor: d => elevationColor(d.value), getElevation: d => d.value * 50000,
        elevationScale: 1, pickable: true,
        onClick: (info) => { if (info.object) selectHex(info.object.hex); }
      }));
    }

    if (layerState['h3-vegetation']) {
      layers.push(new deck.H3HexagonLayer({
        id: 'h3-vegetation-layer', data: hexes.map(hex => ({ hex, value: getVegetation(hex) })),
        getHexagon: d => d.hex, filled: true, stroked: false, extruded: false,
        getFillColor: d => vegetationColor(d.value), pickable: true,
        onClick: (info) => { if (info.object) selectHex(info.object.hex); }
      }));
    }

    if (layerState['h3-hydrology']) {
      layers.push(new deck.H3HexagonLayer({
        id: 'h3-hydrology-layer', data: hexes.map(hex => ({ hex, value: getHydrology(hex) })),
        getHexagon: d => d.hex, filled: true, stroked: false, extruded: false,
        getFillColor: d => hydrologyColor(d.value), pickable: true,
        onClick: (info) => { if (info.object) selectHex(info.object.hex); }
      }));
    }

    if (layerState['land-cover']) {
      layers.push(new deck.H3HexagonLayer({
        id: 'land-cover-layer', data: hexes.map(hex => ({ hex, lc: getLandCover(hex) })),
        getHexagon: d => d.hex, filled: true, stroked: false, extruded: false,
        getFillColor: d => landCoverColor(d.lc), pickable: true,
        onClick: (info) => { if (info.object) selectHex(info.object.hex); }
      }));
    }

    if (layerState['ocean-depth']) {
      layers.push(new deck.H3HexagonLayer({
        id: 'ocean-depth-layer', data: hexes.map(hex => ({ hex, value: pseudoRandom(hex, 999) })),
        getHexagon: d => d.hex, filled: true, stroked: false, extruded: false,
        getFillColor: d => oceanColor(d.value), pickable: true,
        onClick: (info) => { if (info.object) selectHex(info.object.hex); }
      }));
    }

    // Satellites (deck.gl ScatterplotLayer — not geo-anchored to ground)
    for (const satLayer of ['satellites', 'sat-starlink', 'sat-oneWeb']) {
      if (layerState[satLayer] && satData[satLayer]) {
        const positions = getSatPositions(satData[satLayer]);
        const layerDef = LAYER_GROUPS.flatMap(g => g.layers).find(l => l.id === satLayer);
        const c = layerDef.color;
        const r = parseInt(c.slice(1, 3), 16), g2 = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
        layers.push(new deck.ScatterplotLayer({
          id: satLayer + '-layer', data: positions,
          getPosition: d => d.position, getRadius: 50000,
          getFillColor: [r, g2, b, 200], radiusMinPixels: 2, radiusMaxPixels: 6,
          pickable: true,
          onHover: (info) => {
            if (info.object) showTooltipText(info.x, info.y, `🛰 ${info.object.name}\nAlt: ${info.object.altitude.toFixed(0)} km`);
            else hideTooltip();
          }
        }));
      }
    }

    return layers;
  }

  // ══════════════════════════════════════════════════════
  //  Tooltip + Hex Info
  // ══════════════════════════════════════════════════════

  function showTooltip(x, y, hexId) {
    const [lat, lng] = h3.cellToLatLng(hexId);
    const area = h3.cellArea(hexId, 'km2');
    showTooltipText(x, y, `H3: ${hexId}\n${lat.toFixed(4)}°, ${lng.toFixed(4)}°\nArea: ${area.toFixed(1)} km²`);
  }

  function showTooltipText(x, y, text) {
    if (!tooltip) { tooltip = document.createElement('div'); tooltip.className = 'hex-tooltip'; document.body.appendChild(tooltip); }
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function hideTooltip() { if (tooltip) tooltip.style.display = 'none'; }

  function selectHex(hexId) {
    selectedHex = hexId;
    const panel = document.getElementById('hex-info-panel');
    panel.style.display = '';
    panel.classList.remove('hidden');
    const content = document.getElementById('hex-info-content');
    const [lat, lng] = h3.cellToLatLng(hexId);
    const area = h3.cellArea(hexId, 'km2');
    const res = h3.getResolution(hexId);
    const neighbors = h3.gridDisk(hexId, 1).length - 1;
    const parent = res > 0 ? h3.cellToParent(hexId, res - 1) : 'N/A';
    const childCount = res < 15 ? h3.cellToChildren(hexId, res + 1).length : 'N/A';
    const elev = getElevation(hexId), veg = getVegetation(hexId), hydro = getHydrology(hexId), lc = getLandCover(hexId);

    content.innerHTML = `
      <div class="hex-detail"><div class="hex-detail-label">H3 Index</div><div class="hex-detail-value">${hexId}</div></div>
      <div class="hex-detail"><div class="hex-detail-label">Resolution</div><div class="hex-detail-value">${res}</div></div>
      <div class="hex-detail"><div class="hex-detail-label">Center</div><div class="hex-detail-value">${lat.toFixed(6)}° N, ${lng.toFixed(6)}° E</div></div>
      <div class="hex-detail"><div class="hex-detail-label">Area</div><div class="hex-detail-value">${area.toFixed(2)} km²</div></div>
      <div class="hex-detail"><div class="hex-detail-label">Neighbors</div><div class="hex-detail-value">${neighbors}</div></div>
      <div class="hex-detail"><div class="hex-detail-label">Parent Cell</div><div class="hex-detail-value">${parent}</div></div>
      <div class="hex-detail"><div class="hex-detail-label">Children (res ${res + 1})</div><div class="hex-detail-value">${childCount}</div></div>
      <div style="border-top: 1px solid var(--border); margin: 12px 0; padding-top: 12px;">
        <div class="hex-detail">
          <div class="hex-detail-label">Elevation Index</div><div class="hex-detail-value">${(elev * 100).toFixed(1)}%</div>
          <div class="hex-detail-bar"><div class="hex-detail-bar-fill" style="width:${elev * 100}%; background: #ff6b35;"></div></div>
        </div>
        <div class="hex-detail">
          <div class="hex-detail-label">Vegetation (NDVI)</div><div class="hex-detail-value">${(veg * 100).toFixed(1)}%</div>
          <div class="hex-detail-bar"><div class="hex-detail-bar-fill" style="width:${veg * 100}%; background: #2d8a4e;"></div></div>
        </div>
        <div class="hex-detail">
          <div class="hex-detail-label">Hydrology</div><div class="hex-detail-value">${(hydro * 100).toFixed(1)}%</div>
          <div class="hex-detail-bar"><div class="hex-detail-bar-fill" style="width:${hydro * 100}%; background: #1f6feb;"></div></div>
        </div>
        <div class="hex-detail">
          <div class="hex-detail-label">Land Cover</div><div class="hex-detail-value">${lc.type}</div>
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════
  //  Layer Panel + Toggles
  // ══════════════════════════════════════════════════════

  function renderLayerPanel() {
    const list = document.getElementById('layer-list');
    list.innerHTML = '';
    LAYER_GROUPS.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'layer-group';
      const title = document.createElement('div');
      title.className = 'layer-group-title';
      title.textContent = group.name;
      groupEl.appendChild(title);

      group.layers.forEach(layer => {
        const item = document.createElement('div');
        item.className = 'layer-item' + (layerState[layer.id] ? ' active' : '');
        item.innerHTML = `
          <div class="layer-swatch" style="background: ${layer.color}"></div>
          <span class="layer-name">${layer.name}</span>
          <div class="layer-toggle"></div>`;
        item.addEventListener('click', () => toggleLayer(layer.id, item));
        groupEl.appendChild(item);
      });
      list.appendChild(groupEl);
    });
  }

  async function toggleLayer(id, itemEl) {
    layerState[id] = !layerState[id];
    itemEl.classList.toggle('active');

    // Satellite layers — load data
    if (layerState[id] && (id === 'satellites' || id === 'sat-starlink' || id === 'sat-oneWeb')) {
      await loadSatellites(id);
      startSatAnimation();
    }

    // Terrain toggle (guard: source may not exist yet during first second)
    if (id === 'terrain-3d' && map.getSource('terrain')) {
      map.setTerrain(layerState[id] ? { source: 'terrain', exaggeration: 1.5 } : null);
    }

    // MapLibre native layer visibility
    if (MAPLIBRE_LAYER_IDS[id]) {
      setMapLayerVisibility(id, layerState[id]);
    }

    // deck.gl layers always rebuild
    updateDeckLayers();
  }

  function startSatAnimation() {
    if (satAnimFrame) return;
    function animate() {
      if (!['satellites', 'sat-starlink', 'sat-oneWeb'].some(id => layerState[id])) { satAnimFrame = null; return; }
      updateDeckLayers();
      satAnimFrame = requestAnimationFrame(animate);
    }
    satAnimFrame = requestAnimationFrame(animate);
  }

  let updatePending = false;
  function updateDeckLayers() {
    if (updatePending) return;
    updatePending = true;
    requestAnimationFrame(() => {
      if (deckOverlay) deckOverlay.setProps({ layers: buildDeckLayers() });
      updatePending = false;
    });
  }

  function updateStatus() {
    const center = map.getCenter(), zoom = map.getZoom();
    document.getElementById('status-coords').textContent = `${center.lat.toFixed(4)}°, ${center.lng.toFixed(4)}°`;
    document.getElementById('status-hex').textContent = `H3 res ${currentRes}`;
    document.getElementById('status-zoom').textContent = `Zoom ${zoom.toFixed(1)}`;
  }

  // ══════════════════════════════════════════════════════
  //  Theme
  // ══════════════════════════════════════════════════════

  function toggleTheme() {
    isDark = !isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    const btn = document.getElementById('theme-toggle');
    btn.innerHTML = isDark
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

    // Rebuild style (GeoJSON sources + layers are embedded in the style spec)
    mapSourcesAdded = false;
    map.setStyle(buildStyle(isDark));
    map.once('style.load', () => {
      // Re-add terrain/hillshade (not in style spec to avoid worker race)
      map.addSource('terrain', { type: 'raster-dem', url: TERRAIN_TILES, tileSize: 256 });
      map.addSource('hillshade', { type: 'raster-dem', url: TERRAIN_TILES, tileSize: 256 });
      map.addLayer({
        id: 'hillshade', type: 'hillshade', source: 'hillshade',
        paint: { 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#ffffff',
                 'hillshade-accent-color': '#00d4aa', 'hillshade-exaggeration': 0.3 }
      }, 'roads-line');
      if (layerState['terrain-3d']) map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
      updateDeckLayers();
      addMapInteractions();
    });
  }

  // ══════════════════════════════════════════════════════
  //  File Upload — GeoJSON / KML / KMZ
  // ══════════════════════════════════════════════════════

  const uploadedLayers = [];  // { id, name, type, geojson, visible, color }
  let uploadCounter = 0;

  // Palette for uploaded layers (rotates)
  const UPLOAD_COLORS = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7',
    '#fd79a8', '#00b894', '#e17055', '#0984e3', '#fdcb6e'
  ];

  function getUploadColor() {
    return UPLOAD_COLORS[uploadCounter % UPLOAD_COLORS.length];
  }

  function getFileType(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'geojson' || ext === 'json') return 'geojson';
    if (ext === 'kml') return 'kml';
    if (ext === 'kmz') return 'kmz';
    return null;
  }

  async function parseUploadedFile(file) {
    const type = getFileType(file.name);
    if (!type) return null;

    if (type === 'geojson') {
      const text = await file.text();
      try {
        const geojson = JSON.parse(text);
        // Normalize to FeatureCollection
        if (geojson.type === 'Feature') {
          return { type: 'FeatureCollection', features: [geojson] };
        }
        if (geojson.type === 'FeatureCollection') return geojson;
        // Raw geometry
        return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geojson }] };
      } catch (e) {
        console.error('Invalid GeoJSON:', e);
        return null;
      }
    }

    if (type === 'kml') {
      const text = await file.text();
      try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        const gj = toGeoJSON.kml(xml);
        return gj;
      } catch (e) {
        console.error('Invalid KML:', e);
        return null;
      }
    }

    if (type === 'kmz') {
      try {
        const zip = await JSZip.loadAsync(file);
        // Find the .kml file inside the KMZ
        let kmlFile = null;
        zip.forEach((path, entry) => {
          if (path.toLowerCase().endsWith('.kml') && !entry.dir) {
            kmlFile = entry;
          }
        });
        if (!kmlFile) {
          console.error('No KML file found in KMZ');
          return null;
        }
        const kmlText = await kmlFile.async('text');
        const parser = new DOMParser();
        const xml = parser.parseFromString(kmlText, 'text/xml');
        const gj = toGeoJSON.kml(xml);
        return gj;
      } catch (e) {
        console.error('Invalid KMZ:', e);
        return null;
      }
    }

    return null;
  }

  function addUploadedGeoJSON(geojson, fileName) {
    if (!geojson || !geojson.features || geojson.features.length === 0) return;

    const id = 'upload-' + (++uploadCounter);
    const color = getUploadColor();
    const type = getFileType(fileName);

    // Determine geometry types present
    const geoTypes = new Set(geojson.features.map(f => f.geometry?.type).filter(Boolean));
    const hasPoints = geoTypes.has('Point') || geoTypes.has('MultiPoint');
    const hasLines = geoTypes.has('LineString') || geoTypes.has('MultiLineString');
    const hasPolygons = geoTypes.has('Polygon') || geoTypes.has('MultiPolygon');

    const layerInfo = { id, name: fileName, type, geojson, visible: true, color, geoTypes: [...geoTypes] };
    uploadedLayers.push(layerInfo);

    // Add source
    const srcId = id + '-src';
    map.addSource(srcId, { type: 'geojson', data: JSON.parse(JSON.stringify(geojson)) });

    // Add layers based on geometry types present
    const mapLayerIds = [];

    if (hasPolygons) {
      const fillId = id + '-fill';
      const outlineId = id + '-outline';
      map.addLayer({
        id: fillId, type: 'fill', source: srcId,
        filter: ['any', ['==', '$type', 'Polygon']],
        paint: { 'fill-color': color, 'fill-opacity': 0.25 }
      });
      map.addLayer({
        id: outlineId, type: 'line', source: srcId,
        filter: ['any', ['==', '$type', 'Polygon']],
        paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.8 }
      });
      mapLayerIds.push(fillId, outlineId);
    }

    if (hasLines) {
      const lineId = id + '-line';
      map.addLayer({
        id: lineId, type: 'line', source: srcId,
        filter: ['==', '$type', 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color, 'line-width': 3, 'line-opacity': 0.85 }
      });
      mapLayerIds.push(lineId);
    }

    if (hasPoints) {
      const circleId = id + '-circle';
      const labelId = id + '-label';
      map.addLayer({
        id: circleId, type: 'circle', source: srcId,
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 6, 'circle-color': color, 'circle-opacity': 0.9,
                 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 }
      });
      // Try to use 'name' or 'Name' property for labels
      map.addLayer({
        id: labelId, type: 'symbol', source: srcId,
        filter: ['==', '$type', 'Point'],
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ['get', 'Name'], ['get', 'NAME'], ''],
          'text-size': 11,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': false
        },
        paint: {
          'text-color': color,
          'text-halo-color': isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)',
          'text-halo-width': 1.5
        }
      });
      mapLayerIds.push(circleId, labelId);

      // Add hover popup for uploaded points
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '300px' });
      map.on('mouseenter', circleId, (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features[0];
        const props = f.properties;
        let html = '';
        for (const [key, val] of Object.entries(props)) {
          if (val && val !== 'null' && val !== 'undefined') {
            html += `<strong>${key}:</strong> ${val}<br>`;
          }
        }
        if (html) popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('mouseleave', circleId, () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
    }

    layerInfo.mapLayerIds = mapLayerIds;

    // Fit map to uploaded data bounds
    fitToGeoJSON(geojson);

    // Update the uploaded files list UI
    renderUploadedFiles();
  }

  function fitToGeoJSON(geojson) {
    const bounds = new maplibregl.LngLatBounds();
    let hasCoords = false;

    function processCoordsArr(coords) {
      if (typeof coords[0] === 'number') {
        bounds.extend([coords[0], coords[1]]);
        hasCoords = true;
        return;
      }
      coords.forEach(processCoordsArr);
    }

    geojson.features.forEach(f => {
      if (f.geometry && f.geometry.coordinates) {
        processCoordsArr(f.geometry.coordinates);
      }
    });

    if (hasCoords) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 1000 });
    }
  }

  function toggleUploadedLayer(id) {
    const layer = uploadedLayers.find(l => l.id === id);
    if (!layer) return;
    layer.visible = !layer.visible;
    const vis = layer.visible ? 'visible' : 'none';
    (layer.mapLayerIds || []).forEach(lid => {
      if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', vis);
    });
    renderUploadedFiles();
  }

  function removeUploadedLayer(id) {
    const idx = uploadedLayers.findIndex(l => l.id === id);
    if (idx === -1) return;
    const layer = uploadedLayers[idx];
    (layer.mapLayerIds || []).forEach(lid => {
      if (map.getLayer(lid)) map.removeLayer(lid);
    });
    if (map.getSource(id + '-src')) map.removeSource(id + '-src');
    uploadedLayers.splice(idx, 1);
    renderUploadedFiles();
  }

  function renderUploadedFiles() {
    const list = document.getElementById('uploaded-files-list');
    if (!list) return;
    if (uploadedLayers.length === 0) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = uploadedLayers.map(layer => `
      <div class="uploaded-file-item" data-id="${layer.id}">
        <div class="file-icon" style="background: ${layer.color}"></div>
        <span class="file-name" title="${layer.name}">${layer.name}</span>
        <span class="file-type-badge">${layer.type}</span>
        <span class="file-features">${layer.geojson.features.length} features</span>
        <button class="file-toggle ${layer.visible ? 'active' : ''}" data-action="toggle" data-id="${layer.id}" aria-label="Toggle visibility"></button>
        <button class="file-remove" data-action="remove" data-id="${layer.id}" aria-label="Remove layer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Event delegation
    list.querySelectorAll('[data-action="toggle"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleUploadedLayer(btn.dataset.id);
      });
    });
    list.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeUploadedLayer(btn.dataset.id);
      });
    });
  }

  async function handleFiles(files) {
    for (const file of files) {
      const type = getFileType(file.name);
      if (!type) {
        console.warn('Unsupported file type:', file.name);
        continue;
      }
      const geojson = await parseUploadedFile(file);
      if (geojson) {
        addUploadedGeoJSON(geojson, file.name);
      }
    }
  }

  function initFileUpload() {
    const uploadBtn = document.getElementById('file-upload-btn');
    const uploadPanel = document.getElementById('upload-panel');
    const uploadClose = document.getElementById('upload-panel-close');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('file-browse-btn');
    const globalOverlay = document.getElementById('global-drop-overlay');

    // Toggle upload panel
    uploadBtn.addEventListener('click', () => {
      if (uploadPanel.style.display === 'none') {
        uploadPanel.style.display = '';
        uploadPanel.classList.remove('hidden');
      } else {
        uploadPanel.classList.toggle('hidden');
      }
    });
    uploadClose.addEventListener('click', () => {
      uploadPanel.classList.add('hidden');
    });

    // Browse button
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    // Click on drop zone
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFiles(e.target.files);
      fileInput.value = '';
    });

    // Drop zone drag events
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    });

    // Global drag-and-drop (anywhere on the page)
    let dragCounter = 0;
    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) globalOverlay.hidden = false;
    });
    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; globalOverlay.hidden = true; }
    });
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      globalOverlay.hidden = true;
      if (e.dataTransfer.files.length > 0) {
        // Open upload panel
        uploadPanel.style.display = '';
        uploadPanel.classList.remove('hidden');
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════════

  function init() {
    document.documentElement.setAttribute('data-theme', 'dark');

    map = new maplibregl.Map({
      container: 'map',
      style: buildStyle(true),
      center: [20, 30],
      zoom: 3,
      pitch: 45,
      bearing: 0,
      maxPitch: 85,
      antialias: true,
      hash: true
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

    deckOverlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(deckOverlay);

    window._hexMap = map; // expose for QA

    map.on('load', () => {
      updateDeckLayers();
      updateStatus();
      addMapInteractions();

      // Add terrain/hillshade AFTER a short delay — raster-DEM source errors
      // during the load cycle cascade to the GeoJSON worker pool.
      setTimeout(() => {
        if (!map.getSource('terrain')) {
          map.addSource('terrain', { type: 'raster-dem', url: TERRAIN_TILES, tileSize: 256 });
          map.addSource('hillshade', { type: 'raster-dem', url: TERRAIN_TILES, tileSize: 256 });
          map.addLayer({
            id: 'hillshade', type: 'hillshade', source: 'hillshade',
            paint: { 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#ffffff',
                     'hillshade-accent-color': '#00d4aa', 'hillshade-exaggeration': 0.3 }
          }, 'roads-line');
          if (layerState['terrain-3d']) {
            map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
          }
        }
      }, 1000);

      const overlay = document.getElementById('loading-overlay');
      overlay.classList.add('fade-out');
      setTimeout(() => { overlay.style.display = 'none'; }, 600);
    });

    map.on('moveend', () => { updateDeckLayers(); updateStatus(); });
    map.on('move', updateStatus);

    const resSlider = document.getElementById('h3res');
    const resVal = document.getElementById('h3res-val');
    resSlider.addEventListener('input', (e) => {
      currentRes = parseInt(e.target.value);
      resVal.textContent = currentRes;
      updateDeckLayers();
    });

    renderLayerPanel();

    const layerPanel = document.getElementById('layer-panel');
    document.getElementById('layer-toggle-btn').addEventListener('click', () => { layerPanel.classList.toggle('hidden'); });
    document.getElementById('panel-close').addEventListener('click', () => { layerPanel.classList.add('hidden'); });
    document.getElementById('hex-info-btn').addEventListener('click', () => {
      const panel = document.getElementById('hex-info-panel');
      if (panel.style.display === 'none') { panel.style.display = ''; panel.classList.remove('hidden'); }
      else panel.classList.toggle('hidden');
    });
    document.getElementById('hex-info-close').addEventListener('click', () => { document.getElementById('hex-info-panel').classList.add('hidden'); });
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Initialize file upload system
    initFileUpload();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
