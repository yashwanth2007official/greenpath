import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, Leaf, Loader2, Navigation, UserPlus } from 'lucide-react';
import L from 'leaflet';

// Fix leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapEvents({ setOrigin, setDestination, origin, destination }) {
  useMapEvents({
    click(e) {
      if (!origin) {
        setOrigin(e.latlng);
      } else if (!destination) {
        setDestination(e.latlng);
      } else {
        setOrigin(e.latlng);
        setDestination(null);
      }
    },
  });
  return null;
}

export default function App() {
  const [origin, setOrigin] = useState(null);
  
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const [destination, setDestination] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(null);
  
  // Admin panel state
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminLabel, setAdminLabel] = useState('Test Driver');
  const [activeDrivers, setActiveDrivers] = useState([]);

  // Fetch drivers
  const fetchDrivers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/trip-intents`);
      if (res.ok) {
        const data = await res.json();
        setActiveDrivers(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleSearch = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setRoutes([]);
    setSelectedRouteIdx(null);
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination })
      });
      const data = await res.json();
      if (data.options) {
        setRoutes(data.options);
        if (data.options.length > 0) {
            setSelectedRouteIdx(0);
        }
      } else {
        setError(data.error || 'Failed to fetch routes');
      }
    } catch (e) {
      setError(`Backend is unreachable. Make sure the server is running.`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDriver = async () => {
    if (!origin || !destination) {
      alert("Please set origin and destination for the driver on the map first!");
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/trip-intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: adminLabel,
          origin,
          destination,
          seatsAvailable: 3
        })
      });
      if (res.ok) {
        alert("Driver seeded! Re-run your plan to see hitchhike matches.");
        fetchDrivers();
      } else {
        alert("Failed to seed driver.");
      }
    } catch (e) {
      alert("Error contacting backend.");
    }
  };

  const getColorForMode = (mode) => {
    switch(mode) {
      case 'walk':
      case 'bike': return '#22c55e'; // green-500
      case 'bus':
      case 'transit':
      case 'metro': return '#3b82f6'; // blue-500
      case 'car': return '#f97316'; // orange-500
      case 'hitchhike': return '#a855f7'; // purple-500
      default: return '#6b7280'; // gray-500
    }
  };

  const renderPolylines = () => {
    if (selectedRouteIdx === null || !routes[selectedRouteIdx]) return null;
    const route = routes[selectedRouteIdx];
    
    return route.legs.map((leg, i) => {
        if (!leg.geometry || !leg.geometry.coordinates) return null;
        const positions = leg.geometry.coordinates.map(coord => [coord[1], coord[0]]); // GeoJSON is [lng, lat], Leaflet is [lat, lng]
        return (
            <Polyline 
                key={i} 
                positions={positions} 
                color={getColorForMode(leg.mode)} 
                weight={5} 
                opacity={0.8}
            />
        );
    });
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar */}
      <div className="w-1/3 min-w-[350px] max-w-[450px] bg-white shadow-xl z-10 flex flex-col h-full">
        <div className="p-6 bg-green-50 border-b border-green-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="text-green-600 w-8 h-8" />
            <h1 className="text-2xl font-bold text-green-900">GreenPath</h1>
          </div>
          <button onClick={() => setShowAdmin(!showAdmin)} className="text-gray-500 hover:text-green-600 transition-colors">
            <UserPlus className="w-5 h-5" />
          </button>
        </div>

        {showAdmin && (
          <div className="p-4 bg-purple-50 border-b border-purple-100 text-sm">
            <h3 className="font-semibold text-purple-900 mb-2">Admin: Add Live Driver</h3>
            <p className="text-gray-600 mb-2 text-xs">Click two points on the map to set their route.</p>
            <input 
              type="text" 
              value={adminLabel} 
              onChange={e => setAdminLabel(e.target.value)} 
              className="w-full p-2 border rounded mb-2"
              placeholder="Driver Name"
            />
            <button onClick={handleAddDriver} className="w-full bg-purple-600 text-white p-2 rounded hover:bg-purple-700 transition">
              Add Driver to DB
            </button>
            <div className="mt-2 text-xs text-gray-500">
              Active drivers: {activeDrivers.length}
            </div>
          </div>
        )}

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="mt-1"><MapPin className="text-green-500" /></div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Origin</label>
                <div className="p-3 bg-gray-100 rounded-lg text-sm text-gray-700">
                  {origin ? `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}` : 'Click on map to set origin'}
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="mt-1"><MapPin className="text-red-500" /></div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Destination</label>
                <div className="p-3 bg-gray-100 rounded-lg text-sm text-gray-700">
                  {destination ? `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}` : 'Click on map to set destination'}
                </div>
              </div>
            </div>

            <button 
              onClick={handleSearch}
              disabled={!origin || !destination || loading}
              className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all shadow-md ${!origin || !destination ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg'}`}
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Search className="w-5 h-5" />}
              Find Green Route
            </button>
          </div>

          {error && <div className="p-4 bg-red-50 text-red-600 rounded-lg mb-4 text-sm">{error}</div>}

          <div className="space-y-4">
            {routes.map((route, idx) => (
              <div 
                key={idx} 
                onClick={() => setSelectedRouteIdx(idx)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedRouteIdx === idx ? 'border-green-500 bg-green-50/30 shadow-md' : 'border-gray-100 hover:border-green-200 hover:shadow-sm bg-white'}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {idx === 0 && <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">🏆 Recommended</span>}
                      {route.mode === 'composite' || route.mode === 'hitchhike' ? (
                        <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-0.5 rounded">Peer Hitchhike</span>
                      ) : null}
                    </div>
                    <div className="text-xl font-bold mt-1 capitalize text-gray-800 flex items-center gap-2">
                      {route.mode === 'composite' ? 'Transit + Hitchhike' : route.mode}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black text-green-600">{route.greenScore}</div>
                    <div className="text-xs font-medium text-green-800 uppercase tracking-wide">Green Score</div>
                  </div>
                </div>
                
                <div className="flex gap-4 text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded-lg">
                  <div className="flex items-center gap-1"><Navigation className="w-4 h-4 text-gray-400"/> {route.totalDistanceKm} km</div>
                  <div className="flex items-center gap-1">⏱ {route.totalDurationMin} min</div>
                  <div className="flex items-center gap-1">☁️ {Math.round(route.breakdown.co2_grams)}g CO₂</div>
                </div>

                <div className="text-xs space-y-1">
                  <div className="font-semibold text-gray-500 mb-1">Itinerary:</div>
                  <div className="flex flex-wrap items-center gap-1">
                    {route.legs.map((leg, i) => (
                        <React.Fragment key={i}>
                            <span className="px-2 py-1 bg-gray-100 rounded text-gray-700 border border-gray-200 capitalize">
                                {leg.mode}
                            </span>
                            {i < route.legs.length - 1 && <span className="text-gray-400">→</span>}
                        </React.Fragment>
                    ))}
                  </div>
                  {route.legs.some(l => l.matchedDriver) && (
                    <div className="mt-2 text-purple-700 bg-purple-50 p-2 rounded border border-purple-100">
                      <strong>Matched Driver:</strong> {route.legs.find(l => l.matchedDriver).matchedDriver.label}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer 
            center={[13.0827, 80.2707]} // Default Chennai
            zoom={13} 
            className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents setOrigin={setOrigin} setDestination={setDestination} origin={origin} destination={destination} />
          {origin && <Marker position={origin} icon={greenIcon}><Popup>Origin</Popup></Marker>}
          {destination && <Marker position={destination} icon={redIcon}><Popup>Destination</Popup></Marker>}
          {renderPolylines()}
        </MapContainer>
        
        <div className="absolute bottom-4 left-4 z-[400] bg-white p-3 rounded-lg shadow-lg border border-gray-100 flex gap-4 text-xs font-medium">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Walk/Bike</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Transit</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Car</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div> Hitchhike</div>
        </div>
      </div>
    </div>
  );
}
