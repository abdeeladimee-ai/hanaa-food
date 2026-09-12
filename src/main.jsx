import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './qzAutoPrint.js'
import App from './App.jsx'

const internalPath = ['/login', '/admin', '/snack', '/livreur'].some((prefix) =>
  window.location.pathname.toLowerCase().startsWith(prefix),
)

if (!internalPath) {
  const locationGateScript = document.createElement('script')
  locationGateScript.src = '/location-gate.js'
  locationGateScript.async = false
  document.head.appendChild(locationGateScript)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
