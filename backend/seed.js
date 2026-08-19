const axios = require('axios');

async function seed() {
  const driver = {
    label: "Arun - white Swift",
    origin: { lat: 13.0067, lng: 80.2206 }, // Guindy
    destination: { lat: 13.0827, lng: 80.2707 }, // Chennai Central
    departEarliest: new Date().toISOString(),
    departLatest: new Date(Date.now() + 60*60*1000).toISOString(),
    seatsAvailable: 3
  };

  try {
    const res = await axios.post('http://localhost:3001/api/trip-intents', driver);
    console.log('Seeded successfully:', res.data);
  } catch (error) {
    console.error('Error seeding:', error.message);
  }
}

seed();
