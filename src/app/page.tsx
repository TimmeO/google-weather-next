'use client';

import { useState, useEffect, useCallback } from 'react';

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
  daytimeForecast: { weatherCondition: { type: string; description: { text: string } }; relativeHumidity: number; uvIndex: number; precipitation: { probability: { percent: number } }; wind: { speed: { value: number } }; cloudCover: number; interval: { startTime: string; endTime: string } };
  nighttimeForecast?: { weatherCondition: { type: string } };
  maxTemperature: { degrees: number }; minTemperature: { degrees: number };
  feelsLikeMaxTemperature: { degrees: number }; feelsLikeMinTemperature: { degrees: number };
  sunEvents?: { sunriseTime: string; sunsetTime: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ICON: Record<string, string> = {
  CLEAR: '☀️', CLEAR_NIGHT: '🌙', PARTLY_CLOUDY: '⛅', MOSTLY_CLOUDY: '☁️',
  CLOUDY: '☁️', OVERCAST: '☁️', FOG: '🌫️', LIGHT_RAIN: '🌦️', RAIN: '🌧️',
  HEAVY_RAIN: '🌧️', THUNDERSTORM: '⛈️', LIGHT_SNOW: '🌨️', SNOW: '❄️',
  HEAVY_SNOW: '❄️', BLIZZARD: '❄️', HAIL: '🧊', ICE: '🧊',
  SCATTERED_SHOWERS: '🌦️', SHOWERS: '🌦️', BLOWING_SNOW: '❄️', UNKNOWN: '🌡️',
};
const emoji = (t?: string) => t ? (ICON[t] || ICON['UNKNOWN']) : '🌡️';

function windDir(deg?: number) {
  if (deg == null) return '—';
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg / 22.5) % 16];
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
    return d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'short' });
  },
};

function tempColor(t?: number) {
  if (t == null) return 'text-white';
  if (t <= 0) return 'text-blue-300';
  if (t <= 10) return 'text-green-300';
  if (t <= 20) return 'text-yellow-300';
  return 'text-orange-300';
}

// Weather background gradients
function weatherGradient(type?: string, isDaytime = true): string {
  const base = isDaytime ? 'from-blue-400 via-blue-500 to-blue-600' : 'from-slate-700 via-slate-800 to-slate-900';
  switch (type) {
    case 'CLEAR': return isDaytime ? 'from-amber-400 via-orange-400 to-orange-500' : 'from-slate-700 via-slate-800 to-indigo-900';
    case 'PARTLY_CLOUDY': return isDaytime ? 'from-sky-400 via-blue-400 to-blue-500' : 'from-slate-600 via-slate-700 to-slate-800';
    case 'MOSTLY_CLOUDY': case 'CLOUDY': case 'OVERCAST': return 'from-slate-400 via-slate-500 to-slate-600';
    case 'RAIN': case 'HEAVY_RAIN': case 'LIGHT_RAIN': case 'SCATTERED_SHOWERS': case 'SHOWERS': return 'from-slate-500 via-blue-600 to-slate-700';
    case 'THUNDERSTORM': return 'from-slate-700 via-purple-800 to-slate-900';
    case 'SNOW': case 'LIGHT_SNOW': case 'HEAVY_SNOW': case 'BLIZZARD': case 'BLOWING_SNOW': return 'from-slate-200 via-blue-200 to-slate-300';
    default: return base;
  }
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
  const [tab, setTab] = useState<'current' | 'hourly' | 'daily'>('current');
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
    const stored = localStorage.getItem('darkMode');
    if (stored) setDark(stored === 'true');
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (dark) { document.documentElement.classList.add('dark'); } else { document.documentElement.classList.remove('dark'); }
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

  const gradient = weatherGradient(current?.weatherCondition?.type, current?.isDaytime !== false);
  const temp = current?.temperature?.degrees;
  const feels = current?.feelsLikeTemperature?.degrees;
  const condition = current?.weatherCondition;

  return (
    <div className={`min-h-screen transition-colors duration-500 ${dark ? 'dark bg-slate-900' : 'bg-slate-100'}`}>

      {/* Hero Section */}
      <div className={`bg-gradient-to-br ${gradient} text-white transition-all duration-700 relative overflow-hidden`}>
        {/* Decorative circles */}
        <div className="absolute top-[-80px] right-[-80px] w-64 h-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-[-60px] left-[-40px] w-48 h-48 rounded-full bg-white/5 blur-2xl" />

        <div className="relative z-10 max-w-lg mx-auto px-5 pt-10 pb-8">
          {/* Header row */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Sää</h1>
              <button onClick={() => setShowLoc(true)} className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm mt-1 transition">
                <span>📍 {location.name}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <button onClick={() => setDark(!dark)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg hover:bg-white/30 transition">
              {dark ? '☀️' : '🌙'}
            </button>
          </div>

          {/* Main temp display */}
          {loading ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-white/80 text-sm">{error}</p>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-8xl mb-2">{emoji(condition?.type)}</div>
              <div className={`text-7xl font-bold tracking-tighter ${tempColor(temp)}`}>{fmt.t(temp)}</div>
              <p className="text-white/80 text-lg mt-1 capitalize">{condition?.description?.text || ''}</p>
              <p className="text-white/60 text-sm mt-0.5">Tuntuu kuin {fmt.t(feels)}</p>
              <div className="flex justify-center gap-6 mt-5 text-white/70 text-sm">
                <span>💧 {current?.relativeHumidity ?? '—'}%</span>
                <span>💨 {current?.wind?.speed?.value ?? '—'} km/h</span>
                <span>🌬 {windDir(current?.wind?.direction?.degrees)}</span>
              </div>
              <p className="text-white/40 text-xs mt-3">
                {current?.timeZone?.id?.replace('_', ' ')} · {fmt.h(current?.currentTime)} · päivitetty juuri
              </p>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-lg mx-auto px-5 flex gap-1 bg-white/10 backdrop-blur-sm rounded-2xl p-1.5 relative z-10">
          {(['current', 'hourly', 'daily'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-white/70 hover:text-white'}`}>
              {t === 'current' ? 'Nyt' : t === 'hourly' ? 'Tuntiennuste' : 'Päivät'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-5 py-6">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-blue-400" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">😕</div>
            <p className="text-slate-400 mb-4">{error}</p>
            <button onClick={load} className="px-5 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition">Yritä uudelleen</button>
          </div>
        )}

        {!loading && !error && tab === 'current' && current && <CurrentView c={current} dark={dark} />}
        {!loading && !error && tab === 'hourly' && hourly && <HourlyView h={hourly} dark={dark} />}
        {!loading && !error && tab === 'daily' && daily && <DailyView d={daily} dark={dark} />}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-300 dark:text-slate-600 pb-8">
        Google Maps Platform Weather API · DeepMind AI
      </div>

      {/* Location Modal */}
      {showLoc && <LocationModal location={location} onSelect={(loc) => { setLocation(loc); setShowLoc(false); }} onClose={() => setShowLoc(false)} dark={dark} />}
    </div>
  );
}

// ─── Location Modal ────────────────────────────────────────────────────────────
function LocationModal({ location, onSelect, onClose, dark }: { location: Location; onSelect: (l: Location) => void; onClose: () => void; dark: boolean }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`w-full max-w-lg rounded-t-3xl p-6 ${dark ? 'bg-slate-800' : 'bg-white'} animate-in`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">Valitse sijainti</h2>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {PRESETS.map(p => (
            <button key={p.name} onClick={() => onSelect(p)}
              className={`w-full text-left px-3 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition text-sm ${p.name === location.name ? 'bg-blue-50 dark:bg-blue-900/30 font-semibold ring-1 ring-blue-200 dark:ring-blue-700' : ''}`}>
              📍 {p.name}
            </button>
          ))}
        </div>
        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Omat koordinaatit</p>
          <div className="flex gap-2">
            <input value={lat} onChange={e => setLat(e.target.value)} type="number" step="any" placeholder="Lat" 
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-white" />
            <input value={lon} onChange={e => setLon(e.target.value)} type="number" step="any" placeholder="Lon" 
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-white" />
            <button onClick={() => { const la = parseFloat(lat); const lo = parseFloat(lon); if (!isNaN(la) && !isNaN(lo)) onSelect({ name: `${la}, ${lo}`, lat: la, lon: lo }); }}
              className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition">→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Current View ─────────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, sub, color = 'blue' }: { icon: string; label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = { blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-500', green: 'bg-green-50 dark:bg-green-900/20 text-green-500', yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-500', red: 'bg-red-50 dark:bg-red-900/20 text-red-500', purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-500', cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-500', slate: 'bg-slate-50 dark:bg-slate-800 text-slate-500' };
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${colors[color]}`}>{icon}</div>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{label}</p>
      </div>
      <div className="text-xl font-bold text-slate-800 dark:text-white">{value}</div>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function CurrentView({ c, dark }: { c: CurrentData; dark: boolean }) {
  const w = c.weatherCondition || {};
  const precip = c.precipitation || {};
  const hist = c.currentConditionsHistory;
  const uvPct = Math.min((c.uvIndex ?? 0) / 11 * 100, 100);
  const uvLabel = c.uvIndex == null ? '—' : c.uvIndex <= 2 ? 'Matala' : c.uvIndex <= 5 ? 'Kohtalainen' : c.uvIndex <= 7 ? 'Korkea' : c.uvIndex <= 10 ? 'Hyvin korkea' : 'Äärimmäinen';
  const hiLabel = c.heatIndex?.degrees == null ? '—' : c.heatIndex.degrees < 27 ? 'Mukava' : c.heatIndex.degrees < 32 ? 'Kuuma' : c.heatIndex.degrees < 39 ? 'Erittäin kuuma' : 'Vaarallinen';

  return (
    <div className="space-y-4 animate-in">
      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon="💨" label="Tuuli" color="cyan"
          value={`${c.wind?.speed?.value ?? '—'} km/h`}
          sub={`${windDir(c.wind?.direction?.degrees)} · puuskat ${c.wind?.gust?.value ?? '—'} km/h`} />
        <MetricCard icon="🌧️" label="Sade" color="blue"
          value={`${precip.qpf?.quantity ?? '—'} mm`}
          sub={`Todennäköisyys ${precip.probability?.percent ?? '—'}%`} />
        <MetricCard icon="📊" label="Ilmanpaine" color="slate"
          value={`${c.airPressure?.meanSeaLevelMillibars?.toFixed(1) ?? '—'} hPa`} />
        <MetricCard icon="👁️" label="Näkyvyys" color="slate"
          value={`${c.visibility?.distance ?? '—'} km`}
          sub={`Pilvisyys ${c.cloudCover ?? '—'}%`} />
        <MetricCard icon="☀️" label="UV-indeksi" color="yellow"
          value={`${c.uvIndex ?? '—'}`}
          sub={uvLabel} />
        <MetricCard icon="🌡️" label="Kastepiste" color="green"
          value={fmt.t(c.dewPoint?.degrees)}
          sub={hiLabel} />
      </div>

      {/* 24h changes */}
      {hist && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">📊 Viimeisen 24h muutokset</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><div className="text-lg font-bold text-slate-800 dark:text-white">{fmt.t(hist.maxTemperature?.degrees)}</div><div className="text-xs text-slate-400">ylin</div></div>
            <div><div className="text-lg font-bold text-slate-800 dark:text-white">{fmt.t(hist.minTemperature?.degrees)}</div><div className="text-xs text-slate-400">alin</div></div>
            <div><div className={`text-lg font-bold ${(hist.temperatureChange?.degrees ?? 0) >= 0 ? 'text-green-500' : 'text-blue-500'}`}>{hist.temperatureChange?.degrees >= 0 ? '+' : ''}{hist.temperatureChange?.degrees?.toFixed(1) ?? '—'}°</div><div className="text-xs text-slate-400">muutos</div></div>
            <div><div className="text-lg font-bold text-slate-800 dark:text-white">{hist.qpf?.quantity ?? '—'} mm</div><div className="text-xs text-slate-400">sade</div></div>
          </div>
          {c.thunderstormProbability != null && c.thunderstormProbability > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-purple-500">
              <span>⛈️</span>
              <span>Ukosteen todennäköisyys: {c.thunderstormProbability}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hourly View ─────────────────────────────────────────────────────────────
function HourlyView({ h, dark }: { h: HourlyData; dark: boolean }) {
  const hours = h.forecastHours || [];
  if (!hours.length) return <p className="text-center text-slate-400 py-12">Ei dataa</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-400">{hours.length} tunnin ennuste</p>
      <div className="overflow-x-auto -mx-5 px-5">
        <div className="flex gap-2.5 pb-2" style={{ minWidth: 'max-content' }}>
          {hours.map((h2, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 rounded-2xl p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm" style={{ minWidth: '76px' }}>
              <div className="text-xs text-slate-400 dark:text-slate-500">{i === 0 ? 'Nyt' : fmt.h(h2.interval.startTime)}</div>
              <div className="text-2xl">{emoji(h2.weatherCondition?.type)}</div>
              <div className={`text-base font-bold ${tempColor(h2.temperature?.degrees)}`}>{fmt.t(h2.temperature?.degrees)}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">{fmt.t(h2.feelsLikeTemperature?.degrees)}</div>
              <div className="text-xs text-blue-400 dark:text-blue-300">💧{h2.precipitation?.probability?.percent ?? '—'}%</div>
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
  if (!days.length) return <p className="text-center text-slate-400 py-12">Ei dataa</p>;

  return (
    <div className="space-y-3">
      {days.map((day, i) => {
        const dayW = day.daytimeForecast?.weatherCondition || {};
        const nightW = day.nighttimeForecast?.weatherCondition;
        const sun = day.sunEvents;
        return (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">{fmt.day(day.interval?.startTime)}</p>
                <p className="text-xs text-slate-400 capitalize">{dayW.description?.text || ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-3xl">{emoji(dayW.type)}</div>
                {nightW?.type && <div className="text-2xl opacity-60">{emoji(nightW.type)}</div>}
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className={`text-xl font-bold ${tempColor(day.maxTemperature?.degrees)}`}>{fmt.t(day.maxTemperature?.degrees)}</span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-slate-400">{fmt.t(day.minTemperature?.degrees)}</span>
              <span className="ml-auto flex items-center gap-3 text-xs text-slate-400">
                <span>🌧️ {day.daytimeForecast?.precipitation?.probability?.percent ?? '—'}%</span>
                <span>💨 {day.daytimeForecast?.wind?.speed?.value ?? '—'} km/h</span>
                <span>☀️ UV {day.daytimeForecast?.uvIndex ?? '—'}</span>
              </span>
            </div>
            {sun?.sunriseTime && (
              <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400">
                <span>🌅 {fmt.h(sun.sunriseTime)}</span>
                <span>🌇 {fmt.h(sun.sunsetTime)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
