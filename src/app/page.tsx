'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, ComposedChart, Bar } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Location { lat: number; lon: number; name: string; }
interface CurrentData {
  currentTime: string; timeZone: { id: string }; isDaytime: boolean;
  weatherCondition: { iconBaseUri: string; description: { text: string }; type: string };
  temperature: { degrees: number; unit: string };
  feelsLikeTemperature: { degrees: number; unit: string };
  dewPoint: { degrees: number; unit: string };
  heatIndex: { degrees: number; unit: string };
  relativeHumidity: number; uvIndex: number;
  precipitation: { probability: { percent: number; type: string }; qpf: { quantity: number } };
  thunderstormProbability: number;
  airPressure: { meanSeaLevelMillibars: number };
  wind: { direction: { degrees: number; cardinal: string }; speed: { value: number }; gust: { value: number } };
  windChill?: { degrees: number; unit: string };
  visibility: { distance: number }; cloudCover: number;
  currentConditionsHistory?: { temperatureChange: { degrees: number }; maxTemperature: { degrees: number }; minTemperature: { degrees: number }; qpf: { quantity: number } };
}
interface HourlyData { forecastHours: HourlyEntry[]; }
interface HourlyEntry {
  interval: { startTime: string };
  weatherCondition: { type: string };
  temperature: { degrees: number };
  feelsLikeTemperature: { degrees: number };
  precipitation: { probability: { percent: number } };
}
interface DailyData { forecastDays: DailyEntry[]; }
interface DailyEntry {
  interval: { startTime: string };
  daytimeForecast: {
    weatherCondition: { type: string; description: { text: string } };
    relativeHumidity: number; uvIndex: number;
    precipitation: { probability: { percent: number } };
    wind: { speed: { value: number } };
    cloudCover: number;
    interval: { startTime: string; endTime: string };
  };
  nighttimeForecast?: { weatherCondition: { type: string } };
  maxTemperature: { degrees: number }; minTemperature: { degrees: number };
  feelsLikeMaxTemperature: { degrees: number }; feelsLikeMinTemperature: { degrees: number };
  sunEvents?: { sunriseTime: string; sunsetTime: string };
  moonEvents?: { moonPhase: string; moonriseTimes: string[]; moonsetTimes: string[] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ICON: Record<string, string> = {
  CLEAR: '☀️', CLEAR_NIGHT: '🌙', PARTLY_CLOUDY: '⛅', MOSTLY_CLOUDY: '☁️',
  CLOUDY: '☁️', OVERCAST: '☁️', FOG: '🌫️', LIGHT_RAIN: '🌦️', RAIN: '🌧️',
  HEAVY_RAIN: '🌧️', THUNDERSTORM: '⛈️', LIGHT_SNOW: '🌨️', SNOW: '❄️',
  HEAVY_SNOW: '❄️', BLIZZARD: '❄️', HAIL: '🧊', ICE: '🧊',
  SCATTERED_SHOWERS: '🌦️', SHOWERS: '🌦️', BLOWING_SNOW: '❄️',
  RAIN_AND_SNOW: '🌨️', SNOW_SHOWERS: '🌨️', UNKNOWN: '🌡️',
};
const emoji = (t?: string) => t ? (ICON[t] || ICON['UNKNOWN']) : '🌡️';

const MDI: Record<string, string> = {
  WIND: '💨', HUMIDITY: '💧', UV: '☀️', PRESSURE: '📊',
  VISIBILITY: '👁️', DEW: '🌡️', RAIN: '🌧️', SNOW: '❄️',
  STORM: '⛈️', SUN: '🌤', CLOUD: '☁️', MOON: '🌙',
};
const mdi = (k: string) => MDI[k] || '📌';

function windDir(deg?: number) {
  if (deg == null) return '—';
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg / 22.5) % 16];
}

function toMs(kmh?: number) {
  if (kmh == null) return '—';
  return (kmh / 3.6).toFixed(1);
}

const fmt = {
  t: (v?: number) => v != null ? `${Math.round(v)}°` : '—',
  h: (s?: string) => s ? new Date(s).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—',
  day: (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Tänään';
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return 'Huomenna';
    return d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' });
  },
};

// Weather background gradients (Google demo style)
function weatherBg(type?: string, isDay = true): string {
  switch (type) {
    case 'CLEAR': return isDay ? 'bg-gradient-to-br from-[#4285f4] via-[#5e97f6] to-[#7ab1ff]' : 'bg-gradient-to-br from-[#1a237e] via-[#283593] to-[#1a237e]';
    case 'PARTLY_CLOUDY': return isDay ? 'bg-gradient-to-br from-[#5e97f6] via-[#7ab1ff] to-[#90caf9]' : 'bg-gradient-to-br from-[#1a237e] via-[#303f9f] to-[#3f51b5]';
    case 'MOSTLY_CLOUDY': case 'CLOUDY': case 'OVERCAST': return 'bg-gradient-to-br from-[#546e7a] via-[#607d8b] to-[#78909c]';
    case 'RAIN': case 'HEAVY_RAIN': case 'LIGHT_RAIN': case 'SCATTERED_SHOWERS': case 'SHOWERS': return 'bg-gradient-to-br from-[#37474f] via-[#455a64] to-[#546e7a]';
    case 'THUNDERSTORM': return 'bg-gradient-to-br from-[#1a237e] via-[#311b92] to-[#4527a0]';
    case 'SNOW': case 'LIGHT_SNOW': case 'HEAVY_SNOW': case 'BLIZZARD': case 'BLOWING_SNOW': return 'bg-gradient-to-br from-[#b0bec5] via-[#cfd8dc] to-[#eceff1]';
    default: return isDay ? 'bg-gradient-to-br from-[#4285f4] to-[#1a73e8]' : 'bg-gradient-to-br from-[#202124] to-[#3c4043]';
  }
}

// Google card style
function gCard(dark: boolean, extra = '') {
  return `rounded-[1.75rem] border-0 shadow-[0px_1px_2px_0px_rgba(60,64,67,0.3),0px_1px_4px_0px_rgba(60,64,67,0.25)] ${dark ? 'bg-[#3c4043] text-white' : 'bg-white text-[#202124]'} ${extra}`;
}

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS: Location[] = [
  { name: 'Porvoo', lat: 60.40, lon: 25.65 },
  { name: 'Helsinki', lat: 60.17, lon: 24.94 },
  { name: 'Espoo', lat: 60.21, lon: 24.81 },
  { name: 'Tampere', lat: 61.50, lon: 23.79 },
  { name: 'Turku', lat: 60.45, lon: 22.27 },
  { name: 'Rovaniemi', lat: 66.50, lon: 25.72 },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [location, setLocation] = useState<Location>({ name: 'Porvoo', lat: 60.40, lon: 25.65 });
  const [tab, setTab] = useState<'current' | 'hourly' | 'daily' | 'data'>('current');
  const [dark, setDark] = useState(false);
  const [current, setCurrent] = useState<CurrentData | null>(null);
  const [hourly, setHourly] = useState<HourlyData | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLoc, setShowLoc] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const s = localStorage.getItem('darkMode');
    if (s) setDark(s === 'true');
  }, []);
  useEffect(() => {
    if (!mounted) return;
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('darkMode', String(dark));
  }, [dark, mounted]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [c, h, d] = await Promise.all([
        fetch(`/api/weather/current?lat=${location.lat}&lon=${location.lon}`).then(r => r.json()),
        fetch(`/api/weather/hourly?lat=${location.lat}&lon=${location.lon}&hours=24`).then(r => r.json()),
        fetch(`/api/weather/daily?lat=${location.lat}&lon=${location.lon}&days=10`).then(r => r.json()),
      ]);
      if (c.error) throw new Error(c.error);
      setCurrent(c); setHourly(h); setDaily(d);
    } catch (e: any) { setError(e.message || 'Virhe'); } finally { setLoading(false); }
  }, [location]);

  useEffect(() => { if (mounted) load(); }, [load, mounted]);

  const bg = weatherBg(current?.weatherCondition?.type, current?.isDaytime !== false);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-[#202124] text-white' : 'bg-[#f8f9fa]'}`}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className={`${bg} text-white transition-all duration-700 relative overflow-hidden`}>
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px'}} />
        {/* Glow orbs */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/[0.07] blur-3xl" />
        <div className="absolute -bottom-16 -left-10 w-48 h-48 rounded-full bg-white/[0.05] blur-2xl" />

        <div className="relative z-10 max-w-lg mx-auto px-6 pt-10 pb-7">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="text-[11px] font-medium text-white/60 uppercase tracking-widest mb-0.5">Google AI Sää</div>
              <button onClick={() => setShowLoc(true)} className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition">
                <span>📍 {location.name}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <button onClick={() => setDark(!dark)} className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-base hover:bg-white/30 transition">
              {dark ? '☀️' : '🌙'}
            </button>
          </div>

          {/* Main */}
          {loading ? (
            <div className="flex flex-col items-center py-10">
              <div className="w-10 h-10 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
              <p className="text-white/60 text-sm mt-3">Haetaan…</p>
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-white/80 text-sm">{error}</p>
              <button onClick={load} className="mt-3 px-5 py-2 bg-white/20 rounded-full text-sm hover:bg-white/30 transition">Yritä uudelleen</button>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-8xl mb-1">{emoji(current?.weatherCondition?.type)}</div>
              <div className="text-8xl font-bold tracking-tighter text-white">{fmt.t(current?.temperature?.degrees)}</div>
              <p className="text-white/80 text-lg mt-1 capitalize">{current?.weatherCondition?.description?.text}</p>
              <p className="text-white/50 text-sm mt-0.5">Tuntuu kuin {fmt.t(current?.feelsLikeTemperature?.degrees)}</p>

              {/* Quick stats */}
              <div className="flex justify-center gap-5 mt-6 text-sm text-white/70">
                <span>💧 {current?.relativeHumidity ?? '—'}%</span>
                <span>💨 {toMs(current?.wind?.speed?.value)} m/s</span>
                <span>{windDir(current?.wind?.direction?.degrees)}</span>
              </div>

              <p className="text-white/30 text-xs mt-3">
                {current?.timeZone?.id?.replace(/_/g, ' ')} · {fmt.h(current?.currentTime)}
              </p>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-lg mx-auto px-6 pb-4">
          <div className={`flex gap-1 p-1 rounded-2xl ${dark ? 'bg-white/10' : 'bg-white/20'} backdrop-blur-sm`}>
            {(['current', 'hourly', 'daily', 'data'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-white text-[#4285f4] shadow-sm' : 'text-white/70 hover:text-white'}`}>
                {t === 'current' ? 'Nyt' : t === 'hourly' ? 'Tunnit' : t === 'daily' ? 'Päivät' : 'Data'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-5 py-5">
        {loading && !current && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#dadce0] border-t-[#4285f4] rounded-full animate-spin dark:border-[#3c4043] dark:border-t-[#8ab4f8]" />
          </div>
        )}

        {!loading && error && !current && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">😕</div>
            <p className="text-[#5f6368] mb-4">{error}</p>
            <button onClick={load} className="px-5 py-2.5 bg-[#4285f4] text-white rounded-full text-sm font-medium hover:bg-[#1a73e8] transition">Yritä uudelleen</button>
          </div>
        )}

        {!loading && !error && tab === 'current' && current && <CurrentView c={current} dark={dark} hourly={hourly} />}
        {!loading && !error && tab === 'hourly' && hourly && <HourlyView h={hourly} dark={dark} onSelect={(i) => {}} />}
        {!loading && !error && tab === 'daily' && daily && <DailyView d={daily} dark={dark} />}
        {!loading && !error && tab === 'data' && current && <DataView c={current} hourly={hourly} daily={daily} dark={dark} />}
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-[#9aa0a6] pb-8 leading-relaxed">
        Google Maps Platform Weather API<br/>
        DeepMind AI · Päivittyy 15–30 min välein
      </div>

      {/* Location Modal */}
      {showLoc && <LocationModal location={location} onSelect={loc => { setLocation(loc); setShowLoc(false); }} onClose={() => setShowLoc(false)} dark={dark} />}
    </div>
  );
}

// ─── Map Picker ───────────────────────────────────────────────────────────────
function MapPicker({ lat, lon, onSelect, dark }: { lat: number; lon: number; onSelect: (lat: number, lon: number) => void; dark: boolean }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamically init Leaflet map
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current).setView([lat, lon], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    // Existing marker
    markerRef.current = L.marker([lat, lon], { draggable: true }).addTo(map);

    map.on('click', (e: any) => {
      const { lat: newLat, lng: newLon } = e.latlng;
      markerRef.current.setLatLng([newLat, newLon]);
      onSelect(newLat, newLon);
    });

    markerRef.current.on('dragend', (e: any) => {
      const { lat: newLat, lng: newLon } = e.target.getLatLng();
      onSelect(newLat, newLon);
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="mt-3">
      <div
        ref={mapRef}
        className="w-full rounded-2xl overflow-hidden"
        style={{ height: '240px', zIndex: 0 }}
      />
      <p className="text-[9px] text-[#9aa0a6] mt-1.5 text-center">Klikkaa karttaa valitaksesi sijainnin</p>
    </div>
  );
}

// ─── Location Modal ────────────────────────────────────────────────────────────
function LocationModal({ location, onSelect, onClose, dark }: { location: Location; onSelect: (l: Location) => void; onClose: () => void; dark: boolean }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [mapCoords, setMapCoords] = useState({ lat: location.lat, lon: location.lon });

  const handleMapSelect = (newLat: number, newLon: number) => {
    setMapCoords({ lat: newLat, lon: newLon });
  };

  const handleConfirmMap = () => {
    onSelect({ name: `${mapCoords.lat.toFixed(4)}, ${mapCoords.lon.toFixed(4)}`, lat: mapCoords.lat, lon: mapCoords.lon });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`w-full max-w-lg rounded-t-[1.75rem] p-6 ${dark ? 'bg-[#2d2f31]' : 'bg-white'} animate-in`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium">Valitse sijainti</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#f1f3f4] dark:bg-[#3c4043] flex items-center justify-center text-[#5f6368] dark:text-[#bdc1c6] hover:bg-[#dadce0] dark:hover:bg-[#4a4c4e] transition text-lg">✕</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {PRESETS.map(p => (
            <button key={p.name} onClick={() => onSelect(p)}
              className={`w-full text-left px-3 py-3 rounded-2xl transition text-sm ${p.name === location.name ? 'bg-[#e8f0fe] dark:bg-[#1a3a5c] text-[#1967d2] dark:text-[#8ab4f8] font-medium' : `hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] ${dark ? 'text-white' : 'text-[#202124]'}`}`}>
              📍 {p.name}
            </button>
          ))}
        </div>

        {/* Map picker toggle */}
        <div className="border-t border-[#e8eaed] dark:border-[#3c4043] pt-4 mb-3">
          <button onClick={() => setShowMap(!showMap)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-medium transition ${showMap ? 'bg-[#e8f0fe] dark:bg-[#1a3a5c] text-[#1967d2] dark:text-[#8ab4f8]' : `border border-[#dadce0] dark:border-[#3c4043] ${dark ? 'text-white' : 'text-[#202124]'}`}`}>
            🗺️ {showMap ? 'Piilota kartta' : 'Valitse kartalta'}
          </button>
          {showMap && (
            <>
              <MapPicker lat={mapCoords.lat} lon={mapCoords.lon} onSelect={handleMapSelect} dark={dark} />
              <button onClick={handleConfirmMap}
                className="w-full mt-2 py-2.5 bg-[#4285f4] text-white rounded-2xl text-sm font-medium hover:bg-[#1a73e8] transition">
                Vahvista sijainti: {mapCoords.lat.toFixed(4)}, {mapCoords.lon.toFixed(4)}
              </button>
            </>
          )}
        </div>

        <div className="border-t border-[#e8eaed] dark:border-[#3c4043] pt-4">
          <p className="text-xs font-medium text-[#5f6368] dark:text-[#9aa0a6] mb-2">Omat koordinaatit</p>
          <div className="flex gap-2">
            <input value={lat} onChange={e => setLat(e.target.value)} type="number" step="any" placeholder="Lat (esim. 60.40)"
              className={`flex-1 px-3 py-2.5 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#4285f4] ${dark ? 'bg-[#3c4043] border-[#5f6368] text-white placeholder-[#80868b]' : 'bg-[#f1f3f4] border-0 text-[#202124]'}`} />
            <input value={lon} onChange={e => setLon(e.target.value)} type="number" step="any" placeholder="Lon (esim. 25.65)"
              className={`flex-1 px-3 py-2.5 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#4285f4] ${dark ? 'bg-[#3c4043] border-[#5f6368] text-white placeholder-[#80868b]' : 'bg-[#f1f3f4] border-0 text-[#202124]'}`} />
            <button onClick={() => { const la = parseFloat(lat); const lo = parseFloat(lon); if (!isNaN(la) && !isNaN(lo)) onSelect({ name: `${la}, ${lo}`, lat: la, lon: lo }); }}
              className="px-5 py-2.5 bg-[#4285f4] text-white rounded-2xl text-sm font-medium hover:bg-[#1a73e8] transition">→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wind Rose ────────────────────────────────────────────────────────────────
function WindRose({ wind, dark }: { wind: CurrentData['wind']; dark: boolean }) {
  const deg = wind?.direction?.degrees ?? 0;
  const speed = wind?.speed?.value ?? 0;
  const gust = wind?.gust?.value ?? 0;
  const cardinal = windDir(wind?.direction?.degrees);

  // Compass directions
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  return (
    <div className={`${gCard(dark, 'p-5')}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🧭</span>
          <span className="text-[10px] font-medium text-[#5f6368] dark:text-[#9aa0a6] uppercase tracking-wider">Tuulen suunta</span>
        </div>
        <span className="text-xs font-medium text-[#202124] dark:text-white">{cardinal}</span>
      </div>

      {/* SVG Compass */}
      <div className="relative flex items-center justify-center my-2">
        <svg viewBox="0 0 120 120" className="w-full max-w-[140px]" style={{ filter: dark ? 'drop-shadow(0 0 6px rgba(138,180,248,0.2))' : 'drop-shadow(0 0 6px rgba(66,133,244,0.15))' }}>
          {/* Outer ring */}
          <circle cx="60" cy="60" r="54" fill="none" stroke={dark ? '#3c4043' : '#e8eaed'} strokeWidth="1.5" />
          <circle cx="60" cy="60" r="48" fill="none" stroke={dark ? '#3c4043' : '#e8eaed'} strokeWidth="0.5" />

          {/* Cardinal labels */}
          {[
            { label: 'N', x: 60, y: 14, bold: true },
            { label: 'E', x: 106, y: 64 },
            { label: 'S', x: 60, y: 110 },
            { label: 'W', x: 14, y: 64 },
          ].map(d => (
            <text key={d.label} x={d.x} y={d.y} textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fontWeight={d.bold ? '700' : '400'}
              fill={dark ? '#9aa0a6' : '#5f6368'}>{d.label}</text>
          ))}

          {/* Minor ticks */}
          {Array.from({ length: 36 }).map((_, i) => {
            const a = i * 10;
            const rad = (a - 90) * Math.PI / 180;
            const inner = i % 9 === 0 ? 43 : 47;
            const outer = 52;
            return (
              <line key={i}
                x1={60 + inner * Math.cos(rad)} y1={60 + inner * Math.sin(rad)}
                x2={60 + outer * Math.cos(rad)} y2={60 + outer * Math.sin(rad)}
                stroke={dark ? '#3c4043' : '#dadce0'} strokeWidth={i % 9 === 0 ? 1.5 : 0.5} />
            );
          })}

          {/* Wind speed rings */}
          {[20, 40].map(r => (
            <circle key={r} cx="60" cy="60" r={r} fill="none"
              stroke={dark ? '#3c4043' : '#e8eaed'} strokeWidth="0.5" strokeDasharray="2 3" />
          ))}

          {/* Arrow */}
          <g transform={`rotate(${deg}, 60, 60)`}>
            {/* Arrow body */}
            <polygon
              points={`60,16 56,52 60,48 64,52`}
              fill={dark ? '#8ab4f8' : '#4285f4'}
              opacity="0.9"
            />
            {/* Arrow tail */}
            <polygon
              points={`60,52 56,56 60,98 64,56`}
              fill={dark ? '#8ab4f8' : '#4285f4'}
              opacity="0.35"
            />
            {/* Center dot */}
            <circle cx="60" cy="60" r="5" fill={dark ? '#8ab4f8' : '#4285f4'} />
            <circle cx="60" cy="60" r="2.5" fill={dark ? '#3c4043' : '#ffffff'} />
          </g>
        </svg>

        {/* Speed labels around compass */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[9px] text-[#9aa0a6]">↑ {toMs(speed)} m/s</div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-[#9aa0a6]">puuska {toMs(gust)} m/s</div>
      </div>

      {/* Speed breakdown */}
      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
        {[
          { label: 'Nopeus', value: `${toMs(speed)} m/s` },
          { label: 'Puuska', value: `${toMs(gust)} m/s` },
          { label: 'Suunta', value: `${deg}° ${windDir(deg)}` },
        ].map((item, i) => (
          <div key={i} className={`rounded-xl py-1.5 ${dark ? 'bg-[#3c4043]/50' : 'bg-[#f1f3f4]'}`}>
            <div className="text-[10px] font-bold text-[#202124] dark:text-white">{item.value}</div>
            <div className="text-[9px] text-[#9aa0a6]">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Temperature Chart ─────────────────────────────────────────────────────────
function TempChart({ hourly, daily, dark, mode }: { hourly?: HourlyData | null; daily?: DailyData; dark: boolean; mode: 'hourly' | 'daily' }) {
  const isHourly = mode === 'hourly';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = isHourly
    ? (hourly?.forecastHours?.map(h => ({
        time: new Date(h.interval.startTime).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', hour12: false }),
        temp: h.temperature?.degrees,
        feels: h.feelsLikeTemperature?.degrees,
        rain: h.precipitation?.probability?.percent ?? 0,
      })) ?? [])
    : (daily?.forecastDays?.map(d => ({
        time: d.interval?.startTime ? new Date(d.interval.startTime).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric' }) : '',
        temp: d.maxTemperature?.degrees,
        min: d.minTemperature?.degrees,
        rain: d.daytimeForecast?.precipitation?.probability?.percent ?? 0,
      })) ?? []);

  const temps = data.map(d => d.temp).filter((v): v is number => v != null);
  const minT = Math.min(...temps, 0);
  const maxT = Math.max(...temps, 30);

  const gradientId = `tempGrad-${mode}`;

  return (
    <div className={`${gCard(dark, 'p-5')}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">📈</span>
        <span className="text-[10px] font-medium text-[#5f6368] dark:text-[#9aa0a6] uppercase tracking-wider">
          {isHourly ? 'Lämpötila seuraavat 24h' : 'Päivittäinen lämpötila'}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={dark ? '#8ab4f8' : '#4285f4'} stopOpacity={0.25} />
              <stop offset="95%" stopColor={dark ? '#8ab4f8' : '#4285f4'} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: dark ? '#9aa0a6' : '#5f6368' }}
            tickLine={false} axisLine={false}
            interval={isHourly ? 3 : 0}
          />
          <YAxis
            domain={[Math.floor(minT / 5) * 5 - 2, Math.ceil(maxT / 5) * 5 + 2]}
            tick={{ fontSize: 9, fill: dark ? '#9aa0a6' : '#5f6368' }}
            tickLine={false} axisLine={false}
            tickFormatter={v => `${v}°`}
          />
          <Tooltip
            contentStyle={{
              background: dark ? '#3c4043' : '#fff',
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              fontSize: '12px',
              color: dark ? '#f1f3f4' : '#202124',
            }}
            labelStyle={{ color: dark ? '#9aa0a6' : '#5f6368', fontSize: '10px' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`${v}°`, '']}
          />



          {/* Feels like (hourly only, as dashed) */}
          {isHourly && (
            <Line
              dataKey="feels"
              stroke={dark ? '#9aa0a6' : '#bdc1c6'}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              strokeLinecap="round"
            />
          )}

          {/* Max temp (daily) */}
          <Line
            dataKey="temp"
            stroke={dark ? '#8ab4f8' : '#4285f4'}
            strokeWidth={2.5}
            dot={false}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Min temp (daily only) */}
          {!isHourly && (
            <Line
              dataKey="min"
              stroke={dark ? '#bdc1c6' : '#9aa0a6'}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              strokeLinecap="round"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[9px] text-[#9aa0a6]">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded-full bg-[#4285f4] dark:bg-[#8ab4f8] inline-block" /> Lämpötila</span>
        {isHourly && <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded-full bg-[#bdc1c6] inline-block" style={{borderStyle:'dashed'}} /> Tuntuu kuin</span>}
        {!isHourly && <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded-full bg-[#9aa0a6] inline-block" /> Ylin / Alin</span>}
      </div>
    </div>
  );
}

// ─── Metric Tile (Google demo style) ─────────────────────────────────────────
function MetricTile({ icon, label, value, sub, dark, accent = false }: { icon: string; label: string; value: string; sub?: string; dark: boolean; accent?: boolean }) {
  return (
    <div className={`${gCard(dark, 'p-4 flex flex-col gap-1')} ${accent ? (dark ? 'bg-[#1a3a5c] border border-[#1967d2]/30' : 'bg-[#e8f0fe]') : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] font-medium text-[#5f6368] dark:text-[#9aa0a6] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-[#202124] dark:text-white mt-1">{value}</div>
      {sub && <div className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">{sub}</div>}
    </div>
  );
}

// ─── Divider ───────────────────────────────────────────────────────────────────
function Divider({ dark }: { dark: boolean }) {
  return <div className={`h-px my-1 ${dark ? 'bg-[#3c4043]' : 'bg-[#e8eaed]'}`} />;
}

// ─── Current View ─────────────────────────────────────────────────────────────
function CurrentView({ c, dark, hourly }: { c: CurrentData; dark: boolean; hourly?: HourlyData | null }) {
  const precip = c.precipitation || {};
  const hist = c.currentConditionsHistory;
  const uvPct = Math.min((c.uvIndex ?? 0) / 11 * 100, 100);
  const uvLabel = c.uvIndex == null ? '—' : c.uvIndex <= 2 ? 'Matala' : c.uvIndex <= 5 ? 'Kohtalainen' : c.uvIndex <= 7 ? 'Korkea' : c.uvIndex <= 10 ? 'Hyvin korkea' : 'Äärimmäinen';
  const uvColor = c.uvIndex == null ? '' : c.uvIndex <= 2 ? 'text-[#34a853]' : c.uvIndex <= 5 ? 'text-[#fbbc04]' : c.uvIndex <= 7 ? 'text-[#f29900]' : 'text-[#ea4335]';

  return (
    <div className={`space-y-4 animate-in`}>
      {/* Top row: Wind Rose + Rain */}
      <div className="grid grid-cols-2 gap-3">
        <WindRose wind={c.wind} dark={dark} />
        <div className="space-y-3">
          <MetricTile icon="💧" label="Sade" value={`${precip.qpf?.quantity ?? '—'} mm`}
            sub={`Todennäköisyys ${precip.probability?.percent ?? '—'}%`} dark={dark} />
          <MetricTile icon="📊" label="Ilmanpaine" value={`${c.airPressure?.meanSeaLevelMillibars?.toFixed(1) ?? '—'} hPa`}
            dark={dark} />
        </div>
      </div>

      {/* UV + Visibility row */}
      <div className="grid grid-cols-2 gap-3">
        {/* UV tile with bar */}
        <div className={`${gCard(dark, 'p-3')}`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">☀️</span>
              <span className="text-[9px] font-medium text-[#5f6368] dark:text-[#9aa0a6] uppercase tracking-wider">UV</span>
            </div>
            <span className={`text-base font-bold ${uvColor}`}>{c.uvIndex ?? '—'}</span>
          </div>
          <div className="h-1 rounded-full bg-[#e8eaed] dark:bg-[#5f6368] overflow-hidden mb-1">
            <div className="h-full rounded-full bg-gradient-to-r from-[#34a853] via-[#fbbc04] to-[#ea4335]" style={{ width: `${uvPct}%` }} />
          </div>
          <p className="text-[9px] text-[#5f6368] dark:text-[#9aa0a6]">{uvLabel}</p>
        </div>

        {/* Visibility */}
        <div className={`${gCard(dark, 'p-3')}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm">👁️</span>
            <span className="text-[9px] font-medium text-[#5f6368] dark:text-[#9aa0a6] uppercase tracking-wider">Näkyvyys</span>
          </div>
          <div className="text-base font-bold text-[#202124] dark:text-white">{c.visibility?.distance ?? '—'} km</div>
          <div className="text-[9px] text-[#5f6368] dark:text-[#9aa0a6]">Pilvisyys {c.cloudCover ?? '—'}%</div>
        </div>
      </div>

      {/* Humidity + Dew + Heat — equal sized cards */}
      <div className="grid grid-cols-3 gap-3">
        <MetricTile icon="💧" label="Kosteus" value={`${c.relativeHumidity ?? '—'}%`} dark={dark} />
        <MetricTile icon="🌡️" label="Kastepiste" value={fmt.t(c.dewPoint?.degrees)} dark={dark} />
        <MetricTile icon="🌡️" label="Heat Index" value={fmt.t(c.heatIndex?.degrees)} dark={dark} />
      </div>

      {/* 24h Changes */}
      {hist && (
        <div className={`${gCard(dark, 'p-5')}`}>
          <p className="text-[11px] font-medium text-[#5f6368] dark:text-[#9aa0a6] uppercase tracking-wider mb-3">📊 Viimeisen 24h muutokset</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Ylin', value: fmt.t(hist.maxTemperature?.degrees) },
              { label: 'Alin', value: fmt.t(hist.minTemperature?.degrees) },
              { label: 'Muutos', value: `${(hist.temperatureChange?.degrees ?? 0) >= 0 ? '+' : ''}${hist.temperatureChange?.degrees?.toFixed(1) ?? '—'}°`, color: (hist.temperatureChange?.degrees ?? 0) >= 0 ? 'text-[#34a853]' : 'text-[#4285f4]' },
              { label: 'Sade', value: `${hist.qpf?.quantity ?? '—'} mm` },
            ].map((item, i) => (
              <div key={i}>
                <div className={`text-lg font-bold ${item.color || 'text-[#202124] dark:text-white'}`}>{item.value}</div>
                <div className="text-[10px] text-[#9aa0a6]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hourly View ──────────────────────────────────────────────────────────────
function HourlyView({ h, dark, onSelect }: { h: HourlyData; dark: boolean; onSelect: (i: number) => void }) {
  const hours = h.forecastHours || [];
  if (!hours.length) return <p className="text-center text-[#9aa0a6] py-12">Ei dataa</p>;

  return (
    <div className="space-y-4 animate-in">
      {/* Recharts temp chart */}
      <TempChart hourly={h} dark={dark} mode="hourly" />

      {/* Hour cards */}
      <div className="overflow-x-auto -mx-5 px-5">
        <div className="flex gap-2.5 pb-2" style={{ minWidth: 'max-content' }}>
          {hours.map((h2, i) => (
            <div key={i}
              onClick={() => onSelect(i)}
              className={`flex flex-col items-center gap-1 rounded-2xl p-3 cursor-pointer transition ${dark ? 'hover:bg-[#3c4043]' : 'hover:bg-[#f1f3f4]'} ${i === 0 ? (dark ? 'bg-[#3c4043]' : 'bg-[#f1f3f4]') : ''}`}
              style={{ minWidth: '72px' }}>
              <div className="text-[10px] text-[#9aa0a6]">{i === 0 ? 'Nyt' : fmt.h(h2.interval.startTime)}</div>
              <div className="text-2xl">{emoji(h2.weatherCondition?.type)}</div>
              <div className="text-base font-bold text-[#202124] dark:text-white">{fmt.t(h2.temperature?.degrees)}</div>
              <div className="text-[10px] text-[#9aa0a6]">{fmt.t(h2.feelsLikeTemperature?.degrees)}</div>
              <div className="text-[10px] text-[#4285f4]">💧 {h2.precipitation?.probability?.percent ?? '—'}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Daily View ──────────────────────────────────────────────────────────────
function DailyView({ d, dark }: { d: DailyData; dark: boolean }) {
  const days = d.forecastDays || [];
  if (!days.length) return <p className="text-center text-[#9aa0a6] py-12">Ei dataa</p>;

  return (
    <div className="space-y-4">
      {/* Temp chart for daily */}
      <TempChart daily={d} dark={dark} mode="daily" />
      {days.map((day, i) => {
        const dayW = day.daytimeForecast?.weatherCondition || {};
        const nightW = day.nighttimeForecast?.weatherCondition;
        const sun = day.sunEvents;
        return (
          <div key={i} className={`${gCard(dark, 'p-5')}`}>
            {/* Day header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium text-[#202124] dark:text-white">{fmt.day(day.interval?.startTime)}</p>
                <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6] capitalize">{dayW.description?.text || ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-3xl">{emoji(dayW.type)}</div>
                {nightW?.type && <div className="text-xl opacity-50">{emoji(nightW.type)}</div>}
              </div>
            </div>

            {/* Temp range bar */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-[#202124] dark:text-white w-8">{fmt.t(day.maxTemperature?.degrees)}</span>
              <div className="flex-1 h-1 rounded-full bg-[#e8eaed] dark:bg-[#5f6368] relative">
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#4285f4] to-[#ea4335]"
                  style={{
                    width: `${((day.maxTemperature?.degrees ?? 0) - (day.minTemperature?.degrees ?? 0)) / 30 * 100}%`,
                    marginLeft: `${((day.minTemperature?.degrees ?? 0) + 20) / 50 * 100}%`,
                  }} />
              </div>
              <span className="text-sm text-[#5f6368] dark:text-[#9aa0a6] w-8 text-right">{fmt.t(day.minTemperature?.degrees)}</span>
            </div>

            {/* Detail row */}
            <div className="grid grid-cols-4 gap-2 text-center mb-3">
              {[
                { icon: '🌧️', label: 'Sade', value: `${day.daytimeForecast?.precipitation?.probability?.percent ?? '—'}%` },
                { icon: '💨', label: 'Tuuli', value: `${toMs(day.daytimeForecast?.wind?.speed?.value)} m/s` },
                { icon: '☀️', label: 'UV', value: `${day.daytimeForecast?.uvIndex ?? '—'}` },
                { icon: '💧', label: 'Kost.', value: `${day.daytimeForecast?.relativeHumidity ?? '—'}%` },
              ].map((item, j) => (
                <div key={j} className={`rounded-xl py-1.5 ${dark ? 'bg-[#3c4043]/50' : 'bg-[#f1f3f4]'}`}>
                  <div className="text-xs">{item.icon} <span className="text-[11px] font-bold text-[#202124] dark:text-white">{item.value}</span></div>
                  <div className="text-[9px] text-[#9aa0a6]">{item.label}</div>
                </div>
              ))}
            </div>

            {/* Sun/Moon row */}
            {sun?.sunriseTime && (
              <div className={`flex gap-4 py-2.5 border-t ${dark ? 'border-[#3c4043] text-[#9aa0a6]' : 'border-[#e8eaed] text-[#5f6368]'}`}>
                <span className="text-xs">🌅 {fmt.h(sun.sunriseTime)}</span>
                <span className="text-xs">🌇 {fmt.h(sun.sunsetTime)}</span>
                {day.moonEvents?.moonriseTimes?.[0] && (
                  <span className="text-xs">🌙 {fmt.h(day.moonEvents.moonriseTimes[0])}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Data View — all raw API parameters ───────────────────────────────────────
function DataView({ c, hourly, daily, dark }: { c: CurrentData; hourly?: HourlyData | null; daily?: DailyData | null; dark: boolean }) {
  const rows: { label: string; value: string }[] = [];

  // Meta
  rows.push({ label: '⏰ Aika', value: '' });
  rows.push({ label: 'Nykyinen aika', value: fmt.h(c.currentTime) });
  rows.push({ label: 'Aikavyöhyke', value: c.timeZone?.id?.replace(/_/g, ' ') ?? '—' });
  rows.push({ label: 'Päiväaika', value: c.isDaytime ? 'Kyllä ☀️' : 'Ei 🌙' });

  // Temperature
  rows.push({ label: '🌡️ Lämpötila', value: '' });
  rows.push({ label: 'Lämpötila', value: fmt.t(c.temperature?.degrees) });
  rows.push({ label: 'Tuntuu kuin', value: fmt.t(c.feelsLikeTemperature?.degrees) });
  rows.push({ label: 'Kastepiste', value: fmt.t(c.dewPoint?.degrees) });
  rows.push({ label: 'Lämpöindeksi (Heat Index)', value: fmt.t(c.heatIndex?.degrees) });
  rows.push({ label: 'Tuulen jäähdytys (Wind Chill)', value: fmt.t(c.windChill?.degrees) });
  rows.push({ label: 'Maksimi (24h)', value: fmt.t(c.currentConditionsHistory?.maxTemperature?.degrees) });
  rows.push({ label: 'Minimi (24h)', value: fmt.t(c.currentConditionsHistory?.minTemperature?.degrees) });
  rows.push({ label: 'Muutos (24h)', value: `${(c.currentConditionsHistory?.temperatureChange?.degrees ?? 0) >= 0 ? '+' : ''}${c.currentConditionsHistory?.temperatureChange?.degrees?.toFixed(1) ?? '—'}°` });

  // Wind
  rows.push({ label: '💨 Tuuli', value: '' });
  rows.push({ label: 'Nopeus', value: `${toMs(c.wind?.speed?.value)} m/s` });
  rows.push({ label: 'Puuskat', value: `${toMs(c.wind?.gust?.value)} m/s` });
  rows.push({ label: 'Suunta (asteet)', value: `${c.wind?.direction?.degrees ?? '—'}°` });
  rows.push({ label: 'Suunta (cardinal)', value: c.wind?.direction?.cardinal ?? '—' });
  rows.push({ label: 'Yksikkö (lämpö)', value: c.temperature?.unit ?? '—' });

  // Precipitation
  rows.push({ label: '🌧️ Sade', value: '' });
  rows.push({ label: 'Sademäärä (qpf)', value: `${c.precipitation?.qpf?.quantity ?? '—'} mm` });
  rows.push({ label: 'Sateen tyyppi', value: c.precipitation?.probability?.type ?? '—' });
  rows.push({ label: 'Sateen todennäköisyys', value: `${c.precipitation?.probability?.percent ?? '—'}%` });
  rows.push({ label: 'Ukkosen todennäköisyys', value: `${c.thunderstormProbability ?? '—'}%` });
  rows.push({ label: 'Lumikertymä (qpf)', value: `${(c.precipitation as any)?.snowQpf?.quantity ?? '—'} mm` });

  // Atmosphere
  rows.push({ label: '🌍 Ilmakehä', value: '' });
  rows.push({ label: 'Suhteellinen kosteus', value: `${c.relativeHumidity ?? '—'}%` });
  rows.push({ label: 'Ilmanpaine (hPa)', value: c.airPressure?.meanSeaLevelMillibars?.toFixed(1) ?? '—' });
  rows.push({ label: 'UV-indeksi', value: `${c.uvIndex ?? '—'}` });
  rows.push({ label: 'Näkyvyys', value: `${c.visibility?.distance ?? '—'} km` });
  rows.push({ label: 'Pilvisyys', value: `${c.cloudCover ?? '—'}%` });

  // Condition
  rows.push({ label: '☁️ Olosuhde', value: '' });
  rows.push({ label: 'Säätyyppi', value: c.weatherCondition?.type ?? '—' });
  rows.push({ label: 'Kuvaus', value: c.weatherCondition?.description?.text ?? '—' });
  rows.push({ label: 'Ikonipohja', value: c.weatherCondition?.iconBaseUri ?? '—' });

  // Historical
  rows.push({ label: '📊 Historia (24h)', value: '' });
  rows.push({ label: 'Lämpötilan muutos', value: `${(c.currentConditionsHistory?.temperatureChange?.degrees ?? 0) >= 0 ? '+' : ''}${c.currentConditionsHistory?.temperatureChange?.degrees?.toFixed(2) ?? '—'}°` });
  rows.push({ label: 'Ylin lämpötila', value: fmt.t(c.currentConditionsHistory?.maxTemperature?.degrees) });
  rows.push({ label: 'Alin lämpötila', value: fmt.t(c.currentConditionsHistory?.minTemperature?.degrees) });
  rows.push({ label: 'Sademäärä (24h)', value: `${c.currentConditionsHistory?.qpf?.quantity ?? '—'} mm` });

  // Daily summary
  if (daily?.forecastDays?.[0]) {
    const d0 = daily.forecastDays[0];
    rows.push({ label: '📅 Päiväennuste (tänään)', value: '' });
    rows.push({ label: 'Ylin lämpö', value: fmt.t(d0.maxTemperature?.degrees) });
    rows.push({ label: 'Alin lämpö', value: fmt.t(d0.minTemperature?.degrees) });
    rows.push({ label: 'Tuntuu kuin (max)', value: fmt.t(d0.feelsLikeMaxTemperature?.degrees) });
    rows.push({ label: 'Tuntuu kuin (min)', value: fmt.t(d0.feelsLikeMinTemperature?.degrees) });
    rows.push({ label: 'Auringonnousu', value: fmt.h(d0.sunEvents?.sunriseTime) });
    rows.push({ label: 'Auringonlasku', value: fmt.h(d0.sunEvents?.sunsetTime) });
    rows.push({ label: 'Kuun vaihe', value: d0.moonEvents?.moonPhase ?? '—' });
    rows.push({ label: 'Kuun nousu', value: fmt.h(d0.moonEvents?.moonriseTimes?.[0]) });
    rows.push({ label: 'Kuun lasku', value: fmt.h(d0.moonEvents?.moonsetTimes?.[0]) });
  }

  // Hourly next
  if (hourly?.forecastHours?.[1]) {
    const h1 = hourly.forecastHours[1];
    rows.push({ label: '⏱️ Seuraava tunti (+1h)', value: '' });
    rows.push({ label: 'Lämpötila', value: fmt.t(h1.temperature?.degrees) });
    rows.push({ label: 'Tuntuu kuin', value: fmt.t(h1.feelsLikeTemperature?.degrees) });
    rows.push({ label: 'Sateen %', value: `${h1.precipitation?.probability?.percent ?? '—'}%` });
    rows.push({ label: 'Säätyyppi', value: h1.weatherCondition?.type ?? '—' });
  }

  // Render
  return (
    <div className={`${gCard(dark, 'p-5')}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">📋</span>
        <span className="text-[10px] font-medium text-[#5f6368] dark:text-[#9aa0a6] uppercase tracking-wider">
          Kaikki parametrit — {rows.length} kenttää
        </span>
      </div>
      <div className="space-y-0">
        {rows.map((row, i) => {
          if (!row.value) {
            // Section header
            return (
              <div key={i} className={`pt-3 pb-1.5 mt-1 first:mt-0 first:pt-0 border-t border-[#e8eaed] dark:border-[#3c4043] ${i === 0 ? 'border-t-0 pt-0 mt-0' : ''}`}>
                <p className="text-[10px] font-bold text-[#4285f4] dark:text-[#8ab4f8] uppercase tracking-wider">{row.label}</p>
              </div>
            );
          }
          return (
            <div key={i} className="flex items-center justify-between py-2 border-b border-[#f1f3f4] dark:border-[#2d2f31] last:border-0">
              <span className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">{row.label}</span>
              <span className="text-[11px] font-medium text-[#202124] dark:text-white text-right max-w-[55%] truncate">{row.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
