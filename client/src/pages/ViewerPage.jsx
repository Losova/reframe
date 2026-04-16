import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import { fetchVideo } from '../lib/api.js';
import { createBrowserSupabase } from '../lib/supabase.js';

const AnnotationPlayer = lazy(() => import('../components/AnnotationPlayer.jsx'));

export default function ViewerPage({ config, configError, configLoading }) {
  const { shareId } = useParams();
  const [videoUrl, setVideoUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadVideo() {
      if (configLoading) {
        return;
      }

      if (configError || !config) {
        setLoading(false);
        setError(configError || 'Supabase configuration is unavailable.');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const record = await fetchVideo(shareId);
        const supabase = createBrowserSupabase(config);
        const { data } = supabase.storage
          .from(config.bucketName)
          .getPublicUrl(record.playbackPath);

        if (!data.publicUrl) {
          throw new Error('Unable to resolve the playback URL.');
        }

        if (!isMounted) {
          return;
        }

        setVideoUrl(data.publicUrl);
        setShareUrl(record.shareUrl);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError.message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadVideo();

    return () => {
      isMounted = false;
    };
  }, [config, configError, configLoading, shareId]);

  return (
    <AppShell
      eyebrow="Review Link"
      title="Playback without the clutter."
      description="This viewer keeps the presentation restrained and studio-friendly: a focused player, a Fabric-powered annotation layer, and a stable URL for quick review rounds."
      asideLines={[
        `Share ID: ${shareId}`,
        'Playback is resolved using the Supabase publishable key exposed by the backend.',
        'Paused frames unlock pen, circle, and arrow tools with Supabase-backed timestamps.',
        'If the upload is missing or invalid, the viewer returns a clear not-found state.'
      ]}
    >
      <div className="panel flex flex-1 flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label">Player</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Shared animation review</h2>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-200/30 hover:bg-white/[0.04]"
            to="/"
          >
            Upload another clip
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center rounded-[1.75rem] border border-white/10 bg-black/20 px-6 py-24 text-center">
            <div>
              <p className="label">Loading</p>
              <p className="mt-3 text-lg text-slate-200">Resolving the review link…</p>
            </div>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="flex flex-1 items-center justify-center rounded-[1.75rem] border border-rose-400/30 bg-rose-500/10 px-6 py-24 text-center">
            <div>
              <p className="label text-rose-100">Unavailable</p>
              <p className="mt-3 text-lg font-medium text-rose-50">{error}</p>
              <p className="mt-3 text-sm leading-7 text-rose-100/80">
                The requested clip could not be found, or the storage configuration is not ready.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-6">
            <Suspense
              fallback={
                <div className="rounded-[1.75rem] border border-white/10 bg-black/20 px-6 py-24 text-center">
                  <p className="label">Loading</p>
                  <p className="mt-3 text-lg text-slate-200">Preparing the annotation canvas…</p>
                </div>
              }
            >
              <AnnotationPlayer
                annotationBucketMs={config?.annotationBucketMs ?? 250}
                shareId={shareId}
                shareUrl={shareUrl}
                videoUrl={videoUrl}
              />
            </Suspense>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
