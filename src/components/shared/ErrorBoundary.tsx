import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-[#004c6e]">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">⚠️</span>
            <div>
              <h1 className="text-lg font-semibold text-red-700">Something went wrong</h1>
              <p className="text-sm text-gray-500">Please refresh the page or contact support.</p>
            </div>
          </div>
          {/* Only show stack trace in development — never expose internals in production */}
          {import.meta.env.DEV && (
            <pre className="bg-red-50 border border-red-200 rounded-lg p-4 text-xs text-red-800 overflow-auto max-h-60 whitespace-pre-wrap">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          )}
          {import.meta.env.PROD && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
              An unexpected error occurred. Please reload the page. If the problem persists, contact support.
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-5 w-full py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
