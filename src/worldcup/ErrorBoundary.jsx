import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4"
          style={{ background: '#1E293B', border: '1px solid #334155', minHeight: 240 }}
        >
          <span className="text-4xl">⚠️</span>
          <div>
            <p className="font-bold text-base" style={{ color: '#F1F5F9' }}>
              Något gick fel
            </p>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>
              Den här delen av appen kunde inte laddas.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{ background: '#F59E0B', color: '#0F172A' }}
          >
            Ladda om sidan
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
