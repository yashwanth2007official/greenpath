const EMISSION_FACTORS = {
  walk: 0,
  bike: 0,
  "e-bike": 20,
  bus: 90,
  metro: 35,
  "light rail": 35,
  train: 35,
  car: 180,
  "car-ev": 60,
};

function computeGreenScore(legs) {
  let totalCo2Grams = 0;
  let totalDurationMin = 0;
  let breakdown = {
    co2_grams: 0,
    time_penalty: 0,
    congestion_penalty: 0,
    aqi_penalty: 0,
    legs_co2: [],
  };

  for (const leg of legs) {
    let factor = EMISSION_FACTORS[leg.mode] !== undefined ? EMISSION_FACTORS[leg.mode] : 100;
    
    // Check if hitchhike leg
    if (leg.mode === 'hitchhike' && leg.matchedDriver) {
      factor = EMISSION_FACTORS['car']; // Base car emission
      factor = factor / (leg.matchedDriver.seatsAvailable + 1); // Split by occupants
    }

    const legCo2 = leg.distance_km * factor;
    totalCo2Grams += legCo2;
    totalDurationMin += leg.duration_min;
    breakdown.legs_co2.push({ mode: leg.mode, distance_km: leg.distance_km, co2: legCo2 });
  }

  breakdown.co2_grams = totalCo2Grams;
  const totalDistanceKm = legs.reduce((acc, leg) => acc + leg.distance_km, 0);

  // Normalization
  // Ceilings: Time 90 min, CO2 3000g, Distance 25km
  const time_norm = Math.min(totalDurationMin / 90, 1) * 100;
  const co2_norm = Math.min(totalCo2Grams / 3000, 1) * 100;
  const distance_norm = Math.min(totalDistanceKm / 25, 1) * 100;

  // Zero-emission bonus: if ALL legs are walk/bike, grant a bonus
  const allGreen = legs.every(l => ['walk', 'bike', 'e-bike'].includes(l.mode));
  const greenBonus = allGreen ? 5 : 0;

  // Score = 100 - weighted penalties + bonus
  // Weights: Time 50%, CO2 30%, Distance 20%
  const penalty = (time_norm * 0.50) + (co2_norm * 0.30) + (distance_norm * 0.20);
  const score = Math.min(100, Math.max(0, 100 - penalty + greenBonus));

  return {
    score: Math.round(score),
    breakdown,
    totalDurationMin: Math.round(totalDurationMin),
    totalDistanceKm: Number(legs.reduce((acc, leg) => acc + leg.distance_km, 0).toFixed(2))
  };
}

module.exports = { computeGreenScore, EMISSION_FACTORS };
