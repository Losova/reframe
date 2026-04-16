import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import ViewerPage from './pages/ViewerPage.jsx';
import { fetchAppConfig } from './lib/api.js';

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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
