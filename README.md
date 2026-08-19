GreenPath is a multi-modal commute planner that builds the greenest journeys using a mix of public transit, private transport, and peer-segment hitchhiking.  
​ It addresses traffic congestion and pollution by recommending multi-modal route ecosystems based on live time, CO₂, congestion, and air quality exposure.  
​ The system operates on a React and Node.js architecture with a lightweight SQLite database, and utilizes turf.js for handling complex geospatial math and overlap detection.  
​It dynamically pulls real-time data from Transitous for multi-modal transit itineraries, OSRM for routing, TomTom for traffic flow, and OpenWeatherMap for air pollution.  
​ Instead of matching full origin-to-destination trips like traditional carpooling apps, the system splices a segment of a stranger's unrelated drive directly into your public transit itinerary, competing against other multi-modal options on a unified Green Score. 
