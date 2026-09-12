import { createRoot } from 'react-dom/client'
import './index.css'
import './customer-cleanup.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

const currentPath = window.location.pathname.toLowerCase()
const snackPath = currentPath.startsWith('/snack')

if (snackPath) {
  import('./qzAutoPrint.js').catch((error) => {
    console.error('QZ cashier tools failed to load:', error)
  })

  if (!document.querySelector('script[data-hanaa-snack-sound]')) {
    const snackSoundScript = document.createElement('script')
    snackSoundScript.src = '/snack-pickup-sound.js'
    snackSoundScript.dataset.hanaaSnackSound = '1'
    snackSoundScript.defer = true
    document.head.appendChild(snackSoundScript)
  }
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Hanaa Food root element not found')
}

createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
