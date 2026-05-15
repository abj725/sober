// netlify/functions/places.js
// Searches Google Places API for nearby liquor stores, bars, and alcohol retailers.
// GOOGLE_PLACES_KEY env var is set in Netlify dashboard — never exposed to users.

const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'GOOGLE_PLACES_KEY not configured on server' })
    };
  }

  let lat, lng, radius;
  try {
    ({ lat, lng, radius } = JSON.parse(event.body || '{}'));
    if (!lat || !lng) throw new Error('lat and lng required');
    radius = Math.min(radius || 500, 2000); // cap at 2km
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: e.message }) };
  }

  // Search for multiple place types that sell alcohol
  // We run two searches: liquor_store type + keyword search for broader coverage
  const searches = [
    // Primary: Google's liquor_store type (catches BC Liquor, private stores)
    buildPlacesUrl(lat, lng, radius, 'liquor_store', null, apiKey),
    // Secondary: bar/nightclub type
    buildPlacesUrl(lat, lng, radius, 'bar', null, apiKey),
    // Tertiary: keyword search catches wine shops, beer stores, etc.
    buildPlacesUrl(lat, lng, radius, null, 'liquor store|wine shop|beer store|BCLDB|BC Liquor', apiKey),
  ];

  try {
    const results = await Promise.all(searches.map(url => fetchPlaces(url)));

    // Merge and deduplicate by place_id
    const seen = new Set();
    const stores = [];

    for (const places of results) {
      for (const place of places) {
        if (!seen.has(place.place_id)) {
          seen.add(place.place_id);
          const dist = haversine(lat, lng, place.geometry.location.lat, place.geometry.location.lng);
          stores.push({
            placeId: place.place_id,
            name: place.name,
            address: place.vicinity || '',
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
            distanceMeters: Math.round(dist),
            isOpen: place.opening_hours?.open_now ?? null,
          });
        }
      }
    }

    // Sort by distance
    stores.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ stores })
    };

  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};

function buildPlacesUrl(lat, lng, radius, type, keyword, apiKey) {
  const base = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: radius.toString(),
    key: apiKey,
  });
  if (type) params.set('type', type);
  if (keyword) params.set('keyword', keyword);
  return `${base}?${params}`;
}

function fetchPlaces(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === 'OK' || parsed.status === 'ZERO_RESULTS') {
            resolve(parsed.results || []);
          } else {
            console.error('Places API error:', parsed.status, parsed.error_message);
            resolve([]); // Don't fail the whole request if one search fails
          }
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', (e) => {
      console.error('Places fetch error:', e.message);
      resolve([]); // Fail gracefully
    });
  });
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
