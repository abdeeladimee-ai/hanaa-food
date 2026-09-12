import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './customer-cleanup.css'
import './qzAutoPrint.js'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
