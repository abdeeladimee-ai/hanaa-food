import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './customer-cleanup.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

const currentPath = window.location.pathname.toLowerCase()
const internalPath = ['/login', '/admin', '/snack', '/livreur'].some((prefix) =>
  currentPath.startsWith(prefix),
)
const snackPath = currentPath.startsWith('/snack')

if (snackPath) {
  import('./qzAutoPrint.js').catch((error) => {
    console.error('QZ cashier tools failed to load:', error)
  })

  if (!document.querySelector('script[data-hanaa-snack-sound]')) {
    const snackSoundScript = document.createElement('script')
    snackSoundScript.src = '/snack-pickup-sound.js'
    snackSoundScript.dataset.hanaaSnackSound = '1'
    document.head.appendChild(snackSoundScript)
  }
}

if (!internalPath) {
  const locationGateScript = document.createElement('script')
  locationGateScript.src = '/location-gate.js'
  locationGateScript.async = false
  document.head.appendChild(locationGateScript)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
