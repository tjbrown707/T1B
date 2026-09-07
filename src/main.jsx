import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/rajdhani/300.css'
import '@fontsource/rajdhani/400.css'
import '@fontsource/rajdhani/500.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import '@fontsource/orbitron/400.css'
import '@fontsource/orbitron/500.css'
import '@fontsource/orbitron/600.css'
import '@fontsource/orbitron/700.css'
import '@fontsource/orbitron/800.css'
import '@fontsource/orbitron/900.css'
import App from './App.jsx'
import { initAnalyticsIfGranted } from './analytics.js'

initAnalyticsIfGranted()

// createRoot (not hydrateRoot) — the prerendered markup in #root is a crawler
// fallback, not a hydration source, and React clears it on first render.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
