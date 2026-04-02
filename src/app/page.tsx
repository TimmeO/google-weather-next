// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Location { lat: number; lon: number; name: string; }
interface CurrentData {
  currentTime: string; timeZone: { id: string }; isDaytime: boolean;
  weatherCondition: { iconBaseUri: string; description: { text: string }; type: string };
  temperature: { degrees: number; unit: string };
  feelsLikeTemperature: { degrees: number; unit: string };
  dewPoint: { degrees: number; unit: string };
  heatIndex: { degrees: number; unit: string };
  relativeHumidity: number; uvIndex: number;
  precipitation: { probability: { percent: number; type: string }; qpf: { quantity: number; unit: string }; };
  thunderstormProbability: number;
  airPressure: { meanSeaLevelMillibars: number };
  wind: { direction: { degrees: number; cardinal: string }; speed: { value: number; unit: string }; gust: { value: number; unit: string }; };
  visibility: { distance: number; unit: string };
  cloudCover: number;
  currentConditionsHistory?: {
    temperatureChange: { degrees: number; unit: string };
    maxTemperature: { degrees: number; unit: string };
    minTemperature: { degrees: number; unit: string };
    qpf: { quantity: number; unit: string };
  };
}
interface HourlyData { forecastHours: HourlyEntry[]; }
interface HourlyEntry {
  interval: { startTime: string; endTime: string };
  weatherCondition: { type: string; description: { text: string } };
  temperature: { degrees: number; unit: string };
  feelsLikeTemperature: { degrees: number; unit: string };
  precipitation: { probability: { percent: number } };
}
interface DailyData { forecastDays: DailyEntry[]; timeZone: { id: string }; }
interface DailyEntry {
  interval: { startTime: string; endTime: string };
  displayDate: { year: number; month: number; day: number };
  daytimeForecast: {
    interval: { startTime: string; endTime: string };
    weatherCondition: { type: string; description: { text: string } };
    relativeHumidity: number; uvIndex: number;
    precipitation: { probability: { percent: number } };
    wind: { direction: { cardinal: string }; speed: { value: number } };
    cloudCover: number;
  };
  nighttimeForecast?: {
    weatherCondition: { type: string; description: { text: string } };
    precipitation: { probability: { percent: number } };
  };
  maxTemperature: { degrees: number; unit: string };
  minTemperature: { degrees: number; unit: string };
  feelsLikeMaxTemperature: { degrees: number; unit: string };
  feelsLikeMinTemperature: { degrees: number; unit: string };
  sunEvents?: { sunriseTime: string; sunsetTime: string };
  moonEvents?: { moonPhase: string; moonriseTimes: string[]; moonsetTimes: string[] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, string> = {
  CLEAR: '☀️', CLEAR_NIGHT: '🌙', PARTLY_CLOUDY: '⛅', MOSTLY_CLOUDY: '☁️',
  CLOUDY: '☁️', OVERCAST: '☁️', FOG: '🌫️', LIGHT_RAIN: '🌦️', RAIN: '🌧️',
  HEAVY_RAIN: '🌧️', THUNDERSTORM: '⛈️', LIGHT_SNOW: '🌨️', SNOW: '❄️',
  HEAVY_SNOW: '❄️', BLIZZARD: '❄️', HAIL: '🧊', ICE: '🧊',
  SCATTERED_SHOWERS: '🌦️', SHOWERS: '🌦️', BLOWING_SNOW: '❄️', UNKNOWN: '🌡️',
};

const emoji = (type?: string) => type ? (ICON_MAP[type] || ICON_MAP['UNKNOWN']) : '🌡️';

function windDir(deg?: number) {
  if (deg == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function fmtTemp(v?: number) { return v != null ? `${Math.round(v)}°` : '—'; }
function fmtTime(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDay(s?: string) {
  if (!s) return '';
  const d = new Date(s);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Tänään';
  return d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'short' });
}
function fmtDate(s?: string) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' });
}

function tempClass(t?: number) {
  if (t == null) return '';
  if (t <= 0) return 'temp-cold';
  if (t <= 10) return 'temp-cool';
  if (t <= 20) return 'temp-warm';
  return 'temp-hot';
}

function uvLabel(uv?: number) {
  if (uv == null) return '—';
  if (uv <= 2) return 'Matala';
  if (uv <= 5) return 'Kohtalainen';
  if (uv <= 7) return 'Korkea';
  if (uv <= 10) return 'Hyvin korkea';
  return 'Äärimmäinen';
}

function hiLabel(hi?: number) {
  if (hi == null) return '—';
  if (hi < 27) return 'Mukava';
  if (hi < 32) return 'Kuuma';
  if (hi < 39) return 'Erittäin kuuma';
  return 'Vaarallisen kuuma';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLoc, setShowLoc] = useState(false);

  useEffect(() => {
    setDark(localStorage.getItem('darkMode') === 'true');
  }, []);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(dark));
  }, [dark]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [c, h, d] = await Promise.all([
        fetch(`/api/weather/current?lat=${location.lat}&lon=${location.lon}`).then(r => r.json()),
        fetch(`/api/weather/hourly?lat=${location.lat}&lon=${location.lon}&hours=24`).then(r => r.json()),
        fetch(`/api/weather/daily?lat=${location.lat}&lon=${location.lon}&days=10`).then(r => r.json()),
      ]);
      if (c.error) throw new Error(c.error);
      setCurrent(c);
      setHourly(h);
      setDaily(d);
    } catch (e: any) {
      setError(e.message || 'Virhe ladattaessa');
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { load(); }, [load]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${dark ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'} transition-colors`}>
      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold">Sää · Google AI 🌤</h1>
            <button onClick={() => setShowLoc(true)} className="text-sm text-slate-500 hover:text-blue-500 flex items-center gap-1 mt-0.5 transition">
              📍 <span>{location.name}</span> ▾
            </button>
          </div>
          <button onClick={() => setDark(!dark)} className="text-2xl hover:scale-110 transition">
            {dark ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-slate-200 dark:border-slate-700">
          {(['current', 'hourly', 'daily'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium transition ${tab === t ? 'tab-active' : 'text-slate-400'}`}>
              {t === 'current' ? 'Nyt' : t === 'hourly' ? 'Tunnit' : 'Päivät'}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="spinner" />
            <p className="text-slate-400 text-sm">Haetaan säätä…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="text-5xl">😕</div>
            <p className="text-slate-400 text-sm">{error}</p>
            <button onClick={load} className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition">
              Yritä uudelleen
            </button>
          </div>
        ) : tab === 'current' && current ? (
          <CurrentView c={current} />
        ) : tab === 'hourly' && hourly ? (
          <HourlyView h={hourly} />
        ) : tab === 'daily' && daily ? (
          <DailyView d={daily} dark={dark} />
        ) : null}

        <p className="text-center text-xs text-slate-300 dark:text-slate-600 mt-8 pb-2">
          Google Maps Platform Weather API · AI ennusteet<br />
          Päivitetty 15–30 min välein · DeepMind/Google Research
        </p>
      </div>

      {/* Location Modal */}
      {showLoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={e => e.target === e.currentTarget && setShowLoc(false)}>
          <div className={`w-full max-w-lg rounded-t-3xl p-6 ${dark ? 'bg-slate-800' : 'bg-white'} animate-in`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Valitse sijainti</h2>
              <button onClick={() => setShowLoc(false)} className="text-2xl text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {PRESETS.map(p => (
                <button key={p.name} onClick={() => { setLocation(p); setShowLoc(false); }}
                  className={`w-full text-left px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition text-sm ${p.name === location.name ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''}`}>
                  📍 {p.name}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <p className="text-sm font-medium mb-2">Omat koordinaatit</p>
              <CoordInput onSelect={(lat, lon) => { setLocation({ name: `${lat}, ${lon}`, lat, lon }); setShowLoc(false); }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coord Input ──────────────────────────────────────────────────────────────
function CoordInput({ onSelect }: { onSelect: (lat: number, lon: number) => void }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  return (
    <div className="flex gap-2">
      <input value={lat} onChange={e => setLat(e.target.value)} type="number" step="any" placeholder="Lat (esim. 60.40)"
        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      <input value={lon} onChange={e => setLon(e.target.value)} type="number" step="any" placeholder="Lon (esim. 25.65)"
        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      <button onClick={() => { const la = parseFloat(lat); const lo = parseFloat(lon); if (!isNaN(la) && !isNaN(lo)) onSelect(la, lo); }}
        className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition">→</button>
    </div>
  );
}


function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl p-4 border bg-white border-slate-100 dark:bg-slate-800 dark:border-slate-700 ${className}`} />;
}

function CurrentView({ c }: { c: CurrentData }) {
  const w = c.weatherCondition || {};
  const wind = c.wind || {};
  const windDir2 = wind.direction || {};
  const precip = c.precipitation || {};
  const vis = c.visibility || {};
  const hist = c.currentConditionsHistory;
  const t = c.temperature || {};

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="text-center animate-in stagger-1">
        <div className="text-7xl mb-2">{emoji(w.type)}</div>
        <p className="text-slate-400 text-sm capitalize">{w.description?.text || 'Tuntematon'}</p>
        <div className={`text-6xl font-bold mt-2 ${tempClass(t.degrees)}`}>{fmtTemp(t.degrees)}</div>
        <p className="text-slate-400 text-sm mt-1">Tuntuu kuin {fmtTemp(c.feelsLikeTemperature?.degrees)}</p>
        <div className="flex justify-center gap-4 mt-4 text-sm text-slate-400">
          <span>💧 {c.relativeHumidity ?? '—'}%</span>
          <span>💨 {wind.speed?.value ?? '—'} km/h</span>
        </div>
        <p className="text-xs text-slate-300 mt-2">Päivitetty {fmtTime(c.currentTime)} · {c.timeZone?.id}</p>
      </Card>

      {/* Details */}
      <div className="grid grid-cols-2 gap-3 animate-in stagger-2">
        <Card><p className="text-xs text-slate-400 mb-1 font-medium">Tuuli</p>
          <div className="text-xl font-semibold">{wind.speed?.value ?? '—'} <span className="text-xs font-normal text-slate-400">km/h</span></div>
          <div className="text-sm text-slate-400">{windDir(windDir2.degrees)} ({windDir2.degrees ?? '—'}°)</div>
          <div className="text-xs text-slate-300 mt-1">Puuskat: {wind.gust?.value ?? '—'} km/h</div>
        </Card>
        <Card><p className="text-xs text-slate-400 mb-1 font-medium">Sade</p>
          <div className="text-xl font-semibold">{precip.qpf?.quantity ?? '—'} <span className="text-xs font-normal text-slate-400">mm</span></div>
          <div className="text-sm text-slate-400">Todennäköisyys: {precip.probability?.percent ?? '—'}%</div>
          <div className="text-xs text-slate-300 mt-1">{precip.probability?.type ?? '—'}</div>
        </Card>
        <Card><p className="text-xs text-slate-400 mb-1 font-medium">Ilmanpaine</p>
          <div className="text-xl font-semibold">{c.airPressure?.meanSeaLevelMillibars?.toFixed(1) ?? '—'} <span className="text-xs font-normal text-slate-400">hPa</span></div>
        </Card>
        <Card><p className="text-xs text-slate-400 mb-1 font-medium">Näkyvyys</p>
          <div className="text-xl font-semibold">{vis.distance ?? '—'} <span className="text-xs font-normal text-slate-400">km</span></div>
          <div className="text-sm text-slate-400">Pilvisyys: {c.cloudCover ?? '—'}%</div>
        </Card>
        <Card><p className="text-xs text-slate-400 mb-1 font-medium">UV-indeksi</p>
          <div className="text-xl font-semibold">{c.uvIndex ?? '—'}</div>
          <div className="w-full gauge-bar mt-2"><div className="gauge-fill bg-yellow-400" style={{ width: `${Math.min((c.uvIndex ?? 0) / 11 * 100, 100)}%` }} /></div>
          <div className="text-xs text-slate-300 mt-1">{uvLabel(c.uvIndex)}</div>
        </Card>
        <Card><p className="text-xs text-slate-400 mb-1 font-medium">Kastepiste</p>
          <div className="text-xl font-semibold">{fmtTemp(c.dewPoint?.degrees)}</div>
          <div className="text-sm text-slate-400">{hiLabel(c.heatIndex?.degrees)}</div>
        </Card>
      </div>

      {/* 24h history */}
      {hist && (
        <Card className="animate-in stagger-3">
          <p className="text-sm font-medium mb-3">📊 Viimeisen 24h muutokset</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Ylin / Alin</span><span className="font-medium">{fmtTemp(hist.maxTemperature?.degrees)} / {fmtTemp(hist.minTemperature?.degrees)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Muutos</span><span className={`font-medium ${(hist.temperatureChange?.degrees ?? 0) >= 0 ? 'text-green-400' : 'text-blue-400'}`}>{hist.temperatureChange?.degrees >= 0 ? '+' : ''}{hist.temperatureChange?.degrees?.toFixed(1) ?? '—'}°</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Sade (24h)</span><span className="font-medium">{hist.qpf?.quantity ?? '—'} mm</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Ukkonen</span><span className="font-medium">{c.thunderstormProbability ?? '—'}%</span></div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Hourly View ──────────────────────────────────────────────────────────────
function HourlyView({ h }: { h: HourlyData }) {
  const hours = h.forecastHours || [];
  if (!hours.length) return <p className="text-center text-slate-400 py-12">Ei dataa</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-400 px-1">{hours.length} tunnin ennuste</p>
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-3 pb-2" style={{ minWidth: 'max-content' }}>
          {hours.map((h2, i) => {
            const w = h2.weatherCondition || {};
            return (
              <div key={i} className={`rounded-2xl p-3 border border-slate-100 dark:border-slate-700 flex flex-col items-center gap-1 animate-in bg-white dark:bg-slate-800`}
                style={{ minWidth: '72px', animationDelay: `${Math.min(i * 20, 300)}ms` }}>
                <div className="text-xs text-slate-400">{i === 0 ? 'Nyt' : fmtTime(h2.interval.startTime)}</div>
                <div className="text-3xl">{emoji(w.type)}</div>
                <div className={`text-lg font-bold ${tempClass(h2.temperature?.degrees)}`}>{fmtTemp(h2.temperature?.degrees)}</div>
                <div className="text-xs text-slate-400">{fmtTemp(h2.feelsLikeTemperature?.degrees)}</div>
                <div className="text-xs text-slate-400">💧{h2.precipitation?.probability?.percent ?? '—'}%</div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-300 dark:text-slate-600 text-center">API päivittää 15–30 min välein</p>
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
        const dayW = day.daytimeForecast?.weatherCondition as { type?: string; description?: { text: string } } | undefined;
        const nightW = day.nighttimeForecast?.weatherCondition as { type?: string; description?: { text: string } } | undefined;
        const sun = day.sunEvents as { sunriseTime?: string; sunsetTime?: string } | undefined;
        return (
          <div key={i} className={`rounded-2xl p-4 border border-slate-100 dark:border-slate-700 animate-in bg-white dark:bg-slate-800`}
            style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-semibold">{fmtDay(day.interval.startTime)}</p>
                <p className="text-xs text-slate-400 capitalize">{dayW.description?.text || ''}</p>
              </div>
              <div className="text-4xl">{emoji(dayW.type)}</div>
            </div>
            <div className="flex gap-2 items-center">
              <span className={`font-bold text-xl ${tempClass(day.maxTemperature?.degrees)}`}>{fmtTemp(day.maxTemperature?.degrees)}</span>
              <span className="text-slate-400">/</span>
              <span className="text-slate-400">{fmtTemp(day.minTemperature?.degrees)}</span>
              <span className="ml-2 text-xs text-slate-300">({fmtTemp(day.feelsLikeMaxTemperature?.degrees)} / {fmtTemp(day.feelsLikeMinTemperature?.degrees)})</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-slate-400">
              <div className="text-center"><div>🌧️</div><div>Sade: {day.daytimeForecast?.precipitation?.probability?.percent ?? '—'}%</div></div>
              <div className="text-center"><div>💨</div><div>{day.daytimeForecast?.wind?.speed?.value ?? '—'} km/h</div></div>
              <div className="text-center"><div>☀️</div><div>UV {day.daytimeForecast?.uvIndex ?? '—'}</div></div>
            </div>
            {sun?.sunriseTime && (
              <div className="flex justify-around mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-300">
                <span>🌅 {fmtTime(sun.sunriseTime)}</span>
                <span>🌇 {fmtTime(sun.sunsetTime)}</span>
              </div>
            )}
            {nightW.type && (
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                <span>Yö 🌙 {emoji(nightW.type)}</span>
                <span className="text-xs">Sade: {day.nighttimeForecast?.precipitation?.probability?.percent ?? '—'}%</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
