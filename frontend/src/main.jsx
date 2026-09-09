import React, { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('UI Error Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-xl border border-red-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto text-xl font-bold">
              ⚠
            </div>
            <h2 className="text-lg font-bold text-slate-800">Đã xảy ra lỗi hiển thị</h2>
            <p className="text-xs text-slate-500">
              {this.state.error?.message || 'Có lỗi không mong muốn trong khi tải dữ liệu giao diện.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-bold hover:bg-red-800 transition"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

