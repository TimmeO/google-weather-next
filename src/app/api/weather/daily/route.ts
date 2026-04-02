import { NextRequest, NextResponse } from 'next/server';

const API_KEY = 'AIzaSyBEdjAm7huNe-fq-72B0tk3QjZDjgncfjk';
const BASE_URL = 'https://weather.googleapis.com/v1';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const days = searchParams.get('days') || '10';
  const units = searchParams.get('units') || 'METRIC';

  if (!lat || !lon) {
    return NextResponse.json({ error: 'Missing lat or lon' }, { status: 400 });
  }

  try {
    const url = `${BASE_URL}/forecast/days:lookup?key=${API_KEY}&location.latitude=${lat}&location.longitude=${lon}&days=${days}&unitsSystem=${units}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `HTTP ${res.status}: ${text}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
