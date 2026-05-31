import { Component, lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { fetchAppConfig } from './lib/api.js';

const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const ViewerPage = lazy(() => import('./pages/ViewerPage.jsx'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="panel w-full max-w-xl p-8 text-center">
        <p className="label">Loading</p>
        <p className="mt-3 text-lg text-slate-200">Preparing the review workspace…</p>
      </div>
    </div>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error
    };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="panel w-full max-w-xl p-8 text-center">
            <p className="label text-amber-100">Reframe</p>
            <h1 className="mt-4 text-2xl font-semibold text-white">
              The app hit a loading issue.
            </h1>
            <p className="mt-3 text-sm leading-7 text-stone-300">
              Hard refresh the page. If it still appears, check the deploy logs
              or send this message:
            </p>
            <pre className="mt-5 overflow-x-auto rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-left text-xs leading-6 text-rose-100">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadConfig() {
      try {
        const data = await fetchAppConfig();

        if (!isMounted) {
          return;
        }

        setConfig(data);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setConfigError(error.message);
      } finally {
        if (isMounted) {
          setConfigLoading(false);
        }
      }
    }

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                config={config}
                configError={configError}
                configLoading={configLoading}
              />
            }
          />
          <Route
            path="/v/:shareId"
            element={
              <ViewerPage
                config={config}
                configError={configError}
                configLoading={configLoading}
              />
            }
          />
          <Route
            path="/o/:shareId/:ownerToken"
            element={
              <ViewerPage
                config={config}
                configError={configError}
                configLoading={configLoading}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}
