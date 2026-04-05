import { NextRequest, NextResponse } from 'next/server';

const API_KEY = 'AIzaSyBEdjAm7huNe-fq-72B0tk3QjZDjgncfjk';
const BASE_URL = 'https://weather.googleapis.com/v1';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const units = searchParams.get('units') || 'METRIC';

  if (!lat || !lon) {
    return NextResponse.json({ error: 'Missing lat or lon' }, { status: 400 });
  }

  try {
    // Fetch: past 24h (hours=-24), current with history, and future 24h in parallel
    const [pastRes, currentRes, futureRes] = await Promise.all([
      fetch(`${BASE_URL}/forecast/hours:lookup?key=${API_KEY}&location.latitude=${lat}&location.longitude=${lon}&hours=-24&unitsSystem=${units}`),
      fetch(`${BASE_URL}/currentConditions:lookup?key=${API_KEY}&location.latitude=${lat}&location.longitude=${lon}&unitsSystem=${units}&extraFields=true`),
      fetch(`${BASE_URL}/forecast/hours:lookup?key=${API_KEY}&location.latitude=${lat}&location.longitude=${lon}&hours=24&unitsSystem=${units}`),
    ]);

    const past = pastRes.ok ? await pastRes.json() : null;
    const current = currentRes.ok ? await currentRes.json() : null;
    const future = futureRes.ok ? await futureRes.json() : null;

    // pastData may be null if API doesn't support negative hours
    // currentConditionsHistory.qpf.quantity = total past 24h rainfall (aggregate)
    const pastHistoryQpf = current?.currentConditionsHistory?.qpf?.quantity ?? null;

    return NextResponse.json({
      pastHours: past?.forecastHours ?? null,      // may be null
      pastHistoryQpf,                                // aggregate fallback
      currentConditionsHistory: current?.currentConditionsHistory ?? null,
      forecastHours: future?.forecastHours ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
