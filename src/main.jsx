import { createRoot } from 'react-dom/client'
import './index.css'
import './customer-cleanup.css'
import ErrorBoundary from './ErrorBoundary.jsx'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Hanaa Food root element not found')
}

const currentPath = window.location.pathname.toLowerCase()
const appLoader = currentPath.startsWith('/snack')
  ? import('./SnackShell.jsx')
  : import('./App.jsx')

appLoader
  .then(({ default: RootApp }) => {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <RootApp />
      </ErrorBoundary>,
    )
  })
  .catch((error) => {
    console.error('Hanaa Food app failed to load:', error)
    rootElement.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;padding:20px;font-family:Arial,sans-serif;background:#fff6f6">
        <section style="max-width:420px;text-align:center;background:#fff;padding:24px;border-radius:18px;border:1px solid #f0d6d8">
          <img src="/hanaa-logo.png" alt="Hanaa Food" style="width:90px;height:90px;object-fit:contain" />
          <h1 style="font-size:22px;color:#351417">Hanaa Food</h1>
          <p style="color:#866b6d">La page n'a pas pu se charger. Vérifiez la connexion puis réessayez.</p>
          <button onclick="window.location.reload()" style="border:0;border-radius:12px;padding:12px 18px;background:#d71920;color:white;font-weight:800">Réessayer</button>
        </section>
      </main>
    `
  })
