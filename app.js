/* =====================================================
   Auspex Strategos — H3 Hexagonal 3D World Map

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
      name: dark ? 'Auspex Strategos Dark' : 'Auspex Strategos Light',
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
    },
    {
      name: 'Cogitator Bellum',
      layers: [
        { id: 'cb-kinetic', name: 'Kinetic Munitions', color: '#f85149', active: false, type: 'cogitator' },
        { id: 'cb-drones', name: 'Drones & UAVs', color: '#58a6ff', active: false, type: 'cogitator' },
        { id: 'cb-ew', name: 'Electronic Warfare', color: '#d2a8ff', active: false, type: 'cogitator' },
        { id: 'cb-defensive', name: 'Defensive Systems', color: '#3fb950', active: false, type: 'cogitator' }
      ]
    }
  ];

  // ── Cogitator Bellum Wiki Reference ──
  const COGITATOR_BELLUM = {
    'cb-kinetic': {
      label: 'Kinetic Munitions',
      color: '#f85149',
      systems: ['JDAM', 'SDB', 'JSOW', 'Hellfire', 'Maverick', 'HIMARS/GMLRS', 'ATACMS', 'Excalibur', 'Tomahawk', 'Storm Shadow/SCALP', 'HARM/AARGM', 'Paveway II/III/IV', 'Brimstone', 'BONUS', 'SMArt-155', 'Taurus KEPD 350', 'AASM Hammer', 'Kh-101/102', 'Iskander-M', 'Kalibr', 'Kinzhal', 'Shahed-136/Geran-2', 'MAM-L', 'DF-21D', 'PL-15']
    },
    'cb-drones': {
      label: 'Drones & UAVs',
      color: '#58a6ff',
      systems: ['MQ-1 Predator', 'MQ-9 Reaper', 'RQ-4 Global Hawk', 'RQ-170 Sentinel', 'Bayraktar TB2', 'Bayraktar Akinci', 'Shahed-129', 'Shahed-136/Geran-2', 'Wing Loong II', 'CH-5 Rainbow', 'Orion UCAV', 'Lancet-3', 'Switchblade 300', 'Switchblade 600', 'Phoenix Ghost', 'Heron TP', 'Harop', 'Harpy', 'Mohajer-6', 'Kargu-2', 'FPV Drones', 'UJ-22 Airborne']
    },
    'cb-ew': {
      label: 'Electronic Warfare',
      color: '#d2a8ff',
      systems: ['Krasukha-4', 'Murmansk-BN', 'Borisoglebsk-2', 'Leer-3', 'Zhitel', 'Pole-21', 'AN/ALQ-99', 'AN/ALQ-249 NGJ', 'EA-18G Growler', 'EC-130H Compass Call', 'Iron Beam DEW', 'DroneShield', 'THOR', 'Coyote C-UAS', 'GPS/GNSS Jamming']
    },
    'cb-defensive': {
      label: 'Defensive Systems',
      color: '#3fb950',
      systems: ['Patriot PAC-3', 'THAAD', 'Aegis BMD', 'NASAMS', 'Iron Dome', 'Davids Sling', 'Arrow-2/3', 'S-300', 'S-400', 'Pantsir-S1', 'Tor-M2', 'Buk-M3', 'IRIS-T SLM', 'Gepard', 'Starstreak', 'Stinger FIM-92', 'HQ-9', 'KM-SAM', 'Hawk XXI']
    }
  };

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

  // Cogitator Bellum placement state
  let placedMarkers = [];   // { id, category, system, color, lngLat }
  let placementMode = null; // null | category id string
  let cbMarkersAdded = false;
  let cbMarkerIdCounter = 0;

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

  function computeElevation(lat, lng) {
    let elev = 200;
    // Himalayas
    const dHim = Math.sqrt(Math.pow(lat - 28, 2) + Math.pow(lng - 85, 2));
    if (dHim < 15) elev += (15 - dHim) / 15 * 6000;
    // Andes
    const dAnd = Math.abs(lng - (-70));
    if (dAnd < 5 && lat > -55 && lat < 10) elev += (5 - dAnd) / 5 * 4000;
    // Alps
    const dAlp = Math.sqrt(Math.pow(lat - 46.5, 2) + Math.pow(lng - 10, 2));
    if (dAlp < 5) elev += (5 - dAlp) / 5 * 3000;
    // Rockies
    const dRock = Math.abs(lng - (-110));
    if (dRock < 8 && lat > 25 && lat < 60) elev += (8 - dRock) / 8 * 3000;
    // Ethiopian Highlands
    const dEth = Math.sqrt(Math.pow(lat - 9, 2) + Math.pow(lng - 39, 2));
    if (dEth < 8) elev += (8 - dEth) / 8 * 2500;
    // Tibetan Plateau
    if (lat > 28 && lat < 38 && lng > 75 && lng < 100) elev += 3500;
    return Math.max(0, Math.min(8848, elev + (Math.sin(lat * 0.1) * 200)));
  }

  function computeNDVI(lat, lng) {
    const absLat = Math.abs(lat);
    // Use deterministic hash instead of random
    const hash = Math.abs(Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453) % 1;
    // Sahara/Arabian desert
    if (lng > -15 && lng < 60 && lat > 15 && lat < 30) return 0.05 + hash * 0.1;
    // Australian interior
    if (lat > -30 && lat < -20 && lng > 125 && lng < 145) return 0.05 + hash * 0.1;
    // Tropical zone: high NDVI
    if (absLat < 15) return 0.6 + hash * 0.3;
    // Temperate: moderate
    if (absLat < 45) return 0.25 + (1 - absLat / 45) * 0.4 + hash * 0.15;
    // Boreal: lower
    if (absLat < 65) return 0.15 + (1 - (absLat - 45) / 20) * 0.3 + hash * 0.1;
    // Arctic/Antarctic
    return 0.02 + hash * 0.05;
  }

  function computeHydrology(lat, lng) {
    let hydro = 0.3;
    const absLat = Math.abs(lat);
    if (absLat < 10) hydro += 0.4;
    if (absLat > 35 && absLat < 55) hydro += 0.2;
    // Amazon basin
    if (lat > -15 && lat < 5 && lng > -75 && lng < -45) hydro += 0.4;
    // Congo basin
    if (lat > -10 && lat < 5 && lng > 15 && lng < 30) hydro += 0.3;
    // Ganges
    if (lat > 22 && lat < 30 && lng > 75 && lng < 92) hydro += 0.3;
    // Mississippi
    if (lat > 29 && lat < 47 && lng > -95 && lng < -85) hydro += 0.2;
    // Desert reduction
    if (lng > -15 && lng < 60 && lat > 15 && lat < 35) hydro -= 0.3;
    if (lat > -30 && lat < -20 && lng > 125 && lng < 145) hydro -= 0.2;
    return Math.max(0, Math.min(1, hydro));
  }

  function getElevation(hex) {
    const [lat, lng] = h3.cellToLatLng(hex);
    return computeElevation(lat, lng);
  }

  function getVegetation(hex) {
    const [lat, lng] = h3.cellToLatLng(hex);
    return computeNDVI(lat, lng);
  }

  function getHydrology(hex) {
    const [lat, lng] = h3.cellToLatLng(hex);
    return computeHydrology(lat, lng);
  }

  function getLandCover(hex) {
    const v = getVegetation(hex);
    const e = getElevation(hex);
    const eNorm = e / 8848;
    if (v > 0.6) return { type: 'Forest', value: v };
    if (eNorm > 0.5) return { type: 'Mountain', value: eNorm };
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
    const poly = [[[sw.lat, sw.lng], [sw.lat, ne.lng], [ne.lat, ne.lng], [ne.lat, sw.lng], [sw.lat, sw.lng]]];
    try {
      let hexes = h3.polygonToCells(poly, res, false);
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

  // Elevation color ramp (e = meters)
  function elevationColor(e) {
    const t = Math.min(e / 5000, 1);
    return [255, Math.floor(107 - t * 67), Math.floor(53 - t * 53), Math.floor(20 + t * 180)];
  }
  // Vegetation color ramp (n = NDVI 0-1)
  function vegetationColor(n) {
    return [Math.floor(45 - n * 25), Math.floor(80 + n * 58), Math.floor(78 - n * 28), Math.floor(10 + n * 180)];
  }
  // Hydrology color ramp (h = 0-1)
  function hydrologyColor(h) {
    return [31, Math.floor(111 + h * 30), Math.floor(150 + h * 85), Math.floor(10 + h * 180)];
  }
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
  //  Cogitator Bellum — Marker Source & Layers
  // ══════════════════════════════════════════════════════

  function buildCBMarkersGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: placedMarkers.map(m => ({
        type: 'Feature',
        properties: { id: m.id, category: m.category, system: m.system, color: m.color },
        geometry: { type: 'Point', coordinates: [m.lngLat.lng, m.lngLat.lat] }
      }))
    };
  }

  function addCBMarkersSourceAndLayers() {
    if (cbMarkersAdded) return;
    if (!map.isStyleLoaded()) return;

    if (!map.getSource('cb-markers-src')) {
      map.addSource('cb-markers-src', { type: 'geojson', data: buildCBMarkersGeoJSON() });
    }

    if (!map.getLayer('cb-markers-circle')) {
      map.addLayer({
        id: 'cb-markers-circle',
        type: 'circle',
        source: 'cb-markers-src',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    }

    if (!map.getLayer('cb-markers-label')) {
      map.addLayer({
        id: 'cb-markers-label',
        type: 'symbol',
        source: 'cb-markers-src',
        layout: {
          'text-field': ['get', 'system'],
          'text-size': 10,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-allow-overlap': false
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)',
          'text-halo-width': 1.5
        }
      });
    }

    // Right-click to remove marker
    map.on('contextmenu', 'cb-markers-circle', (e) => {
      if (e.features && e.features.length > 0) {
        const markerId = e.features[0].properties.id;
        removeMarkerById(markerId);
      }
    });

    // Hover cursor on markers
    map.on('mouseenter', 'cb-markers-circle', () => {
      if (!placementMode) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'cb-markers-circle', () => {
      if (!placementMode) map.getCanvas().style.cursor = '';
    });

    cbMarkersAdded = true;
  }

  function updateCBMarkersSource() {
    const src = map.getSource('cb-markers-src');
    if (src) {
      src.setData(buildCBMarkersGeoJSON());
    }
  }

  function removeMarkerById(id) {
    const idx = placedMarkers.findIndex(m => m.id === id);
    if (idx === -1) return;
    placedMarkers.splice(idx, 1);
    updateCBMarkersSource();
  }

  // ══════════════════════════════════════════════════════
  //  Cogitator Bellum — Placement System
  // ══════════════════════════════════════════════════════

  function enterPlacementMode(categoryId) {
    placementMode = categoryId;
    map.getCanvas().style.cursor = 'crosshair';
    const cbInfo = COGITATOR_BELLUM[categoryId];
    const banner = document.getElementById('placement-banner');
    banner.textContent = `Click map to place ${cbInfo.label} marker. Press Esc to cancel.`;
    banner.style.display = 'block';

    // Update button state
    document.querySelectorAll('.cb-place-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === categoryId);
    });
  }

  function exitPlacementMode() {
    placementMode = null;
    map.getCanvas().style.cursor = '';
    const banner = document.getElementById('placement-banner');
    banner.style.display = 'none';
    document.querySelectorAll('.cb-place-btn').forEach(btn => btn.classList.remove('active'));
  }

  function handleMapClickForPlacement(e) {
    if (!placementMode) return;

    const categoryId = placementMode;
    const cbInfo = COGITATOR_BELLUM[categoryId];
    const lngLat = e.lngLat;

    // Build the popup with a dropdown
    const markerId = ++cbMarkerIdCounter;
    const selectId = `cb-select-${markerId}`;
    const confirmId = `cb-confirm-${markerId}`;

    const options = cbInfo.systems.map(s => `<option value="${s}">${s}</option>`).join('');
    const popupHTML = `
      <strong style="color:${cbInfo.color}">${cbInfo.label}</strong>
      <select id="${selectId}" class="cb-popup-select">
        <option value="">— Select system —</option>
        ${options}
      </select>
      <button id="${confirmId}" class="cb-popup-confirm">Place Marker</button>
    `;

    const markerPopup = new maplibregl.Popup({ closeOnClick: true, maxWidth: '220px' })
      .setLngLat(lngLat)
      .setHTML(popupHTML)
      .addTo(map);

    // Wire up the confirm button after the popup DOM is rendered
    setTimeout(() => {
      const confirmBtn = document.getElementById(confirmId);
      const selectEl = document.getElementById(selectId);
      if (!confirmBtn || !selectEl) return;

      confirmBtn.addEventListener('click', () => {
        const system = selectEl.value;
        if (!system) return;
        placedMarkers.push({ id: markerId, category: categoryId, system, color: cbInfo.color, lngLat });
        updateCBMarkersSource();
        markerPopup.remove();
      });
    }, 50);

    // Stay in placement mode — user can keep placing
  }

  function setupPlacementKeyListener() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && placementMode) {
        exitPlacementMode();
      }
    });
    map.on('click', handleMapClickForPlacement);
  }

  // ══════════════════════════════════════════════════════
  //  Topbar Place Buttons
  // ══════════════════════════════════════════════════════

  function updateCBPlaceButtons() {
    const topbarRight = document.getElementById('topbar-right');

    // Remove existing CB place buttons
    topbarRight.querySelectorAll('.cb-place-btn').forEach(btn => btn.remove());

    // Check which CB categories are active
    const cbGroup = LAYER_GROUPS.find(g => g.name === 'Cogitator Bellum');
    if (!cbGroup) return;

    cbGroup.layers.forEach(layer => {
      if (layerState[layer.id]) {
        const cbInfo = COGITATOR_BELLUM[layer.id];
        const btn = document.createElement('button');
        btn.className = 'cb-place-btn';
        btn.dataset.category = layer.id;
        btn.title = `Place ${cbInfo.label} marker`;
        btn.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${layer.color};margin-right:4px;flex-shrink:0;"></span> Place ${cbInfo.label}`;
        btn.addEventListener('click', () => {
          if (placementMode === layer.id) {
            exitPlacementMode();
          } else {
            enterPlacementMode(layer.id);
          }
        });
        // Insert before theme-toggle
        const themeBtn = document.getElementById('theme-toggle');
        topbarRight.insertBefore(btn, themeBtn);
      }
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
        id: 'h3-elevation-layer',
        data: hexes.map(hex => { const [lat, lng] = h3.cellToLatLng(hex); return { hex, elevation: computeElevation(lat, lng) }; }),
        getHexagon: d => d.hex, filled: true, stroked: false, extruded: false,
        getFillColor: d => elevationColor(d.elevation),
        pickable: true,
        onClick: (info) => { if (info.object) selectHex(info.object.hex); },
        onHover: (info) => {
          if (info.object) showTooltipText(info.x, info.y, `H3: ${info.object.hex}\nElevation: ${info.object.elevation.toFixed(0)} m`);
          else hideTooltip();
        }
      }));
    }

    if (layerState['h3-vegetation']) {
      layers.push(new deck.H3HexagonLayer({
        id: 'h3-vegetation-layer',
        data: hexes.map(hex => { const [lat, lng] = h3.cellToLatLng(hex); return { hex, ndvi: computeNDVI(lat, lng) }; }),
        getHexagon: d => d.hex, filled: true, stroked: false, extruded: false,
        getFillColor: d => vegetationColor(d.ndvi),
        pickable: true,
        onClick: (info) => { if (info.object) selectHex(info.object.hex); },
        onHover: (info) => {
          if (info.object) showTooltipText(info.x, info.y, `H3: ${info.object.hex}\nNDVI: ${info.object.ndvi.toFixed(3)}`);
          else hideTooltip();
        }
      }));
    }

    if (layerState['h3-hydrology']) {
      layers.push(new deck.H3HexagonLayer({
        id: 'h3-hydrology-layer',
        data: hexes.map(hex => { const [lat, lng] = h3.cellToLatLng(hex); return { hex, hydrology: computeHydrology(lat, lng) }; }),
        getHexagon: d => d.hex, filled: true, stroked: false, extruded: false,
        getFillColor: d => hydrologyColor(d.hydrology),
        pickable: true,
        onClick: (info) => { if (info.object) selectHex(info.object.hex); },
        onHover: (info) => {
          if (info.object) showTooltipText(info.x, info.y, `H3: ${info.object.hex}\nHydrology: ${info.object.hydrology.toFixed(3)}`);
          else hideTooltip();
        }
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
    const elevPct = Math.min(elev / 8848, 1) * 100;
    const vegPct = veg * 100;
    const hydroPct = hydro * 100;

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
          <div class="hex-detail-label">Elevation</div><div class="hex-detail-value">${elev.toFixed(0)} m</div>
          <div class="hex-detail-bar"><div class="hex-detail-bar-fill" style="width:${elevPct.toFixed(1)}%; background: #ff6b35;"></div></div>
        </div>
        <div class="hex-detail">
          <div class="hex-detail-label">Vegetation (NDVI)</div><div class="hex-detail-value">${veg.toFixed(3)}</div>
          <div class="hex-detail-bar"><div class="hex-detail-bar-fill" style="width:${vegPct.toFixed(1)}%; background: #2d8a4e;"></div></div>
        </div>
        <div class="hex-detail">
          <div class="hex-detail-label">Hydrology</div><div class="hex-detail-value">${hydro.toFixed(3)}</div>
          <div class="hex-detail-bar"><div class="hex-detail-bar-fill" style="width:${hydroPct.toFixed(1)}%; background: #1f6feb;"></div></div>
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

    // Cogitator Bellum layer toggled — update place buttons
    if (COGITATOR_BELLUM[id]) {
      // If turned off and currently placing this category, exit placement
      if (!layerState[id] && placementMode === id) {
        exitPlacementMode();
      }
      updateCBPlaceButtons();
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
    cbMarkersAdded = false;
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

      // Re-add CB markers source and layers
      addCBMarkersSourceAndLayers();

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

      // Add CB markers source and layers (programmatically, not in buildStyle)
      addCBMarkersSourceAndLayers();

      // Setup placement keyboard listener and map click handler
      setupPlacementKeyListener();

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
