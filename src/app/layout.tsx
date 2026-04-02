import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sää · Google AI',
  description: 'Google Maps Platform Weather API — AI-powered weather with DeepMind',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Icons&display=block" rel="stylesheet" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body>{children}
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" /></body>
    </html>
  );
}
