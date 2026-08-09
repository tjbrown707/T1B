import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initAnalytics } from './analytics.js'

initAnalytics()

// createRoot (not hydrateRoot) — the prerendered markup in #root is a crawler
// fallback, not a hydration source, and React clears it on first render.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
