import { createRoot } from 'react-dom/client'
import './index.css'
import './customer-cleanup.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Hanaa Food root element not found')
}

createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
