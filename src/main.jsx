import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (
  typeof window !== 'undefined' &&
  (window.location.pathname === '/snack' || window.location.pathname.startsWith('/snack/'))
) {
  void import('./qzAutoPrint.js')
  void import('./kitchenAutoPrint.js')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
