import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              오류가 발생했습니다
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 16 }}>
              {this.state.error?.message || '알 수 없는 오류'}
            </p>
            <button
              className="btn-primary btn-md"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
            >
              새로고침
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
