import { lazy, Suspense, useEffect, useState } from 'react';
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
  );
}
