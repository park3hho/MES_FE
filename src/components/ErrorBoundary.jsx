import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  handleReload = () => {
    localStorage.removeItem('user')
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: '16px',
          fontFamily: 'sans-serif',
        }}>
          <p style={{ fontSize: '18px', color: '#333' }}>오류가 발생했습니다.</p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px', fontSize: '16px',
              background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
