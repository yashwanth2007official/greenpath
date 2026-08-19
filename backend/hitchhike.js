const turf = require('@turf/turf');

// Hitchhike Matching Engine
function findHitchhikeMatches(baselineLeg, tripIntents) {
  // If not a driving or transit baseline leg (e.g. walk/bike), don't hitchhike
  if (baselineLeg.mode !== 'car' && baselineLeg.mode !== 'bus') {
    return [];
  }

  const matches = [];
  const legGeometry = baselineLeg.geometry;
  if (!legGeometry || legGeometry.type !== 'LineString') return [];

  // Parse leg geometry into turf feature
  const userPath = turf.lineString(legGeometry.coordinates);

  for (const intent of tripIntents) {
    if (intent.seats_available <= 0) continue;

    let driverGeom;
    try {
      driverGeom = JSON.parse(intent.route_geometry);
    } catch(e) {
      continue;
    }
    if (!driverGeom || driverGeom.type !== 'LineString') continue;

    const driverPath = turf.lineString(driverGeom.coordinates);

    // 1. Coarse filter: bounding box overlap
    const userBbox = turf.bbox(userPath);
    const driverBbox = turf.bbox(driverPath);
    // Rough check if boxes intersect
    if (userBbox[0] > driverBbox[2] || userBbox[2] < driverBbox[0] ||
        userBbox[1] > driverBbox[3] || userBbox[3] < driverBbox[1]) {
      continue;
    }

    // 2. Buffer corridor
    const corridor = turf.buffer(driverPath, 0.25, { units: 'kilometers' });

    // 3. Sample points
    const legLength = turf.length(userPath, { units: 'kilometers' });
    const numPoints = 15;
    let pointsInside = 0;
    
    for (let i = 0; i <= numPoints; i++) {
      const dist = (i / numPoints) * legLength;
      const point = turf.along(userPath, dist, { units: 'kilometers' });
      if (turf.booleanPointInPolygon(point, corridor)) {
        pointsInside++;
      }
    }

    // Require >= 70% inside corridor
    if (pointsInside / (numPoints + 1) >= 0.7) {
      // Find overlap segment
      const nearestEntry = turf.nearestPointOnLine(driverPath, turf.along(userPath, 0, { units: 'kilometers' }));
      const nearestExit = turf.nearestPointOnLine(driverPath, turf.along(userPath, legLength, { units: 'kilometers' }));
      
      const overlapSlice = turf.lineSlice(nearestEntry, nearestExit, driverPath);
      const overlapDistance = turf.length(overlapSlice, { units: 'kilometers' });

      // 4. Timing window filter
      // Estimate driver arrival at entry
      const driverStartToEntry = turf.lineSlice(turf.point(driverPath.geometry.coordinates[0]), nearestEntry, driverPath);
      const distToEntry = turf.length(driverStartToEntry, { units: 'kilometers' });
      const totalDriverDist = intent.distance_km;
      const driverDuration = intent.duration_min;
      
      const timeToEntry = (distToEntry / totalDriverDist) * driverDuration;
      const driverEarliestArr = new Date(intent.depart_earliest).getTime() + timeToEntry * 60000;
      
      // User arrival time at this leg - assuming "now" for baseline simplicity
      const userArrival = Date.now();
      
      // Reject if > 15 mins diff
      const timeDiffMins = Math.abs(driverEarliestArr - userArrival) / 60000;
      if (timeDiffMins > 15) {
        continue;
      }

      // 5. Splice options - return as a matched option to be integrated
      matches.push({
        mode: 'hitchhike',
        distance_km: overlapDistance,
        duration_min: (overlapDistance / totalDriverDist) * driverDuration,
        geometry: overlapSlice.geometry,
        matchedDriver: {
          id: intent.id,
          label: intent.label,
          seatsAvailable: intent.seats_available
        }
      });
    }
  }

  return matches;
}

module.exports = { findHitchhikeMatches };
