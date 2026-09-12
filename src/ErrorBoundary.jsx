import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Hanaa Food UI error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#fff8f8',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        }}
      >
        <section
          style={{
            width: 'min(460px, 100%)',
            padding: '28px',
            borderRadius: '20px',
            background: '#fff',
            boxShadow: '0 16px 40px rgba(90, 0, 0, 0.08)',
            textAlign: 'center',
          }}
        >
          <img src="/hanaa-logo.png" alt="Hanaa Food" style={{ width: '84px', height: '84px', objectFit: 'contain' }} />
          <h1 style={{ margin: '16px 0 8px', color: '#351417', fontSize: '24px' }}>Hanaa Food</h1>
          <p style={{ margin: '0 0 20px', color: '#6f5a5c', lineHeight: 1.6 }}>
            Un problème temporaire est survenu. Rechargez la page pour continuer votre commande.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: '12px',
              padding: '12px 18px',
              background: '#D71920',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Recharger la page
          </button>
        </section>
      </main>
    )
  }
}

export default ErrorBoundary
