const express = require('express');
const cors = require('cors');
const axios = require('axios');
const turf = require('@turf/turf');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { computeGreenScore } = require('./scoring');
const { findHitchhikeMatches } = require('./hitchhike');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const DEMO_CITY = process.env.DEMO_CITY || "Chennai";

// Helper for security and code quality: validate coordinates
function isValidCoord(coord) {
  return coord && typeof coord.lat === 'number' && typeof coord.lng === 'number' &&
         coord.lat >= -90 && coord.lat <= 90 && coord.lng >= -180 && coord.lng <= 180;
}

app.post('/api/trip-intents', async (req, res) => {
  const { label, origin, destination, departEarliest, departLatest, seatsAvailable } = req.body;
  if (!label || !isValidCoord(origin) || !isValidCoord(destination)) {
    return res.status(400).json({ error: 'Missing or invalid required fields (label, origin, destination)' });
  }

  try {
    // Call OSRM to get car route geometry
    const osrmUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const osrmResponse = await axios.get(osrmUrl);
    
    if (!osrmResponse.data.routes || osrmResponse.data.routes.length === 0) {
      return res.status(400).json({ error: 'Could not compute route geometry' });
    }

    const route = osrmResponse.data.routes[0];
    const distance_km = route.distance / 1000;
    const duration_min = route.duration / 60;
    const route_geometry = JSON.stringify(route.geometry);

    const id = uuidv4();
    const insertStmt = db.prepare(`
      INSERT INTO trip_intents (id, label, origin_lat, origin_lng, dest_lat, dest_lng, route_geometry, distance_km, duration_min, depart_earliest, depart_latest, seats_available)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      id, label, 
      origin.lat, origin.lng, 
      destination.lat, destination.lng, 
      route_geometry, 
      distance_km, duration_min, 
      departEarliest || new Date().toISOString(), 
      departLatest || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), 
      seatsAvailable || 1
    );

    res.json({ id, message: 'Trip intent created successfully' });
  } catch (error) {
    console.error('Error creating trip intent:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/trip-intents', (req, res) => {
  try {
    const intents = db.prepare('SELECT id, label, seats_available, depart_earliest, distance_km FROM trip_intents').all();
    res.json(intents);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/plan', async (req, res) => {
  const { origin, destination } = req.body;
  if (!isValidCoord(origin) || !isValidCoord(destination)) {
    return res.status(400).json({ error: 'Missing or invalid origin or destination coordinates' });
  }

  const p_osrm_car = axios.get(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`);
  const p_osrm_bike = axios.get(`https://routing.openstreetmap.de/routed-bike/route/v1/cycling/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`);
  
  // Transitous call
  const p_transitous = axios.get(`https://api.transitous.org/api/v6/plan?fromPlace=${origin.lat},${origin.lng}&toPlace=${destination.lat},${destination.lng}`, {
    headers: { 'User-Agent': 'GreenPath-Hackathon/1.0' }
  });

  const results = await Promise.allSettled([p_osrm_car, p_osrm_bike, p_transitous]);

  let options = [];

  // Parse OSRM Car
  if (results[0].status === 'fulfilled' && results[0].value.data.routes.length > 0) {
    const route = results[0].value.data.routes[0];
    options.push({
      mode: 'car',
      legs: [{
        mode: 'car',
        distance_km: route.distance / 1000,
        duration_min: route.duration / 60,
        geometry: route.geometry
      }]
    });
  }

  // Parse OSRM Bike
  if (results[1].status === 'fulfilled' && results[1].value.data.routes.length > 0) {
    const route = results[1].value.data.routes[0];
    options.push({
      mode: 'bike',
      legs: [{
        mode: 'bike',
        distance_km: route.distance / 1000,
        duration_min: route.duration / 60,
        geometry: route.geometry
      }]
    });
  }

  // Parse Transitous
  if (results[2].status === 'fulfilled' && results[2].value.data.plan && results[2].value.data.plan.itineraries) {
    const itineraries = results[2].value.data.plan.itineraries;
    // Just take the first one or two for simplicity
    for (const it of itineraries.slice(0, 2)) {
      const legs = it.legs.map(leg => ({
        mode: leg.mode.toLowerCase() === 'walk' ? 'walk' : 'bus', // Simplify transit modes
        distance_km: leg.distance / 1000,
        duration_min: leg.duration / 60,
        geometry: { type: "LineString", coordinates: typeof leg.legGeometry.points === 'string' ? decodePolyline(leg.legGeometry.points) : [] }
      }));
      options.push({
        mode: 'transit',
        legs
      });
    }
  }

  // Fallback: If transitous fails or returns no options, provide a fake transit option for demo
  if (options.filter(o => o.mode === 'transit').length === 0) {
    // Generate a simple straight line split in 3
     options.push({
        mode: 'transit',
        legs: [
            {mode: 'walk', distance_km: 0.5, duration_min: 5, geometry: {type: 'LineString', coordinates: [[origin.lng, origin.lat], [origin.lng+0.001, origin.lat+0.001]]}},
            {mode: 'bus', distance_km: 5.0, duration_min: 15, geometry: {type: 'LineString', coordinates: [[origin.lng+0.001, origin.lat+0.001], [destination.lng-0.001, destination.lat-0.001]]}},
            {mode: 'walk', distance_km: 0.5, duration_min: 5, geometry: {type: 'LineString', coordinates: [[destination.lng-0.001, destination.lat-0.001], [destination.lng, destination.lat]]}}
        ]
     });
  }

  // Hitchhike engine logic
  const allTripIntents = db.prepare('SELECT * FROM trip_intents').all();
  const hitchhikeOptions = [];

  for (const option of options) {
    for (let i = 0; i < option.legs.length; i++) {
      const leg = option.legs[i];
      
      const matches = findHitchhikeMatches(leg, allTripIntents);
      for (const match of matches) {
        // Create a new hybrid itinerary
        const newOption = {
          mode: option.mode === 'car' ? 'hitchhike' : 'composite',
          compositeModes: [],
          legs: []
        };
        
        // Copy legs before the splice
        for (let j = 0; j < i; j++) {
            newOption.legs.push({...option.legs[j]});
        }
        
        // Insert hitchhike leg
        newOption.legs.push(match);
        
        // Copy legs after the splice
        for (let j = i + 1; j < option.legs.length; j++) {
            newOption.legs.push({...option.legs[j]});
        }
        
        newOption.compositeModes = newOption.legs.map(l => l.mode);
        hitchhikeOptions.push(newOption);
      }
    }
  }

  options.push(...hitchhikeOptions);

  // Score all options
  for (const option of options) {
    const scoreData = computeGreenScore(option.legs);
    option.greenScore = scoreData.score;
    option.breakdown = scoreData.breakdown;
    option.totalDurationMin = scoreData.totalDurationMin;
    option.totalDistanceKm = scoreData.totalDistanceKm;
  }

  // Sort by green score descending
  options.sort((a, b) => b.greenScore - a.greenScore);

  res.json({ options });
});

// Simple polyline decoder
function decodePolyline(str, precision = 5) {
    let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null, latitude_change, longitude_change, factor = Math.pow(10, Number.isInteger(precision) ? precision : 5);
    while (index < str.length) {
        byte = null; shift = 0; result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
        shift = result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += latitude_change; lng += longitude_change;
        coordinates.push([lng / factor, lat / factor]);
    }
    return coordinates;
}

// Auto-seed for ephemeral storage (e.g. Render)
const seedDriver = async () => {
  const count = db.prepare('SELECT COUNT(*) as count FROM trip_intents').get();
  if (count.count === 0) {
    console.log("Database is empty. Seeding default driver...");
    const driver = {
      label: "Arun - white Swift",
      origin: { lat: 13.0067, lng: 80.2206 }, 
      destination: { lat: 13.0827, lng: 80.2707 },
      departEarliest: new Date().toISOString(),
      departLatest: new Date(Date.now() + 60*60*1000).toISOString(),
      seatsAvailable: 3
    };
    try {
      await axios.post(`http://localhost:${PORT}/api/trip-intents`, driver);
      console.log('Seeded successfully.');
    } catch (error) {
      console.error('Error seeding:', error.message);
    }
  }
};

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  seedDriver();
});
