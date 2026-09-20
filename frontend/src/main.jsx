import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Registering this is what makes the site installable as a real standalone
// app (see public/sw.js and public/manifest.webmanifest) instead of a plain
// browser-tab bookmark shortcut.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal — the site still works as a normal page if this fails
      // (e.g. running over plain HTTP in local dev on some setups).
    })
  })
}
