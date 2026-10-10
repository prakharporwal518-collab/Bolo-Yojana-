import { Component } from 'react';

/** Catches render errors so one broken widget never blanks the whole app. */
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[Bolo Yojana] UI error', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-6 text-center" role="alert">
        <div className="text-5xl">🙏</div>
        <h2 className="mt-3 text-xl font-bold">कुछ गड़बड़ हो गई · Something went wrong</h2>
        <p className="mt-2 text-stone-600">ऐप फिर से शुरू करें। आपकी जानकारी सुरक्षित है। · Please reload. Your data is safe.</p>
        <button className="btn-primary mt-4" onClick={() => { this.setState({ error: null }); window.location.hash = '#/'; window.location.reload(); }}>
          🔄 फिर से शुरू करें · Reload
        </button>
      </div>
    );
  }
}
