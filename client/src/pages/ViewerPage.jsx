import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import {
  fetchAnnotations,
  fetchNotes,
  fetchProject,
  updateProjectStatus
} from '../lib/api.js';

const AnnotationPlayer = lazy(() => import('../components/AnnotationPlayer.jsx'));

function getStatusBadgeClassName(status) {
  const baseClassName = 'rounded-full border px-3 py-1.5';

  if (status === 'approved') {
    return `${baseClassName} border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100`;
  }

  if (status === 'changes_requested') {
    return `${baseClassName} border-rose-300/25 bg-rose-300/[0.08] text-rose-100`;
  }

  if (status === 'final_delivered') {
    return `${baseClassName} border-amber-300/25 bg-amber-300/[0.1] text-amber-100`;
  }

  return `${baseClassName} border-stone-700 bg-black/25 text-stone-300`;
}

function formatDeadline(value) {
  if (!value) {
    return 'No deadline';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Deadline pending';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export default function ViewerPage({ config, configError, configLoading }) {
  const { ownerToken: ownerTokenParam = '', shareId } = useParams();
  const [projectTitle, setProjectTitle] = useState('Shared animation review');
  const [project, setProject] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [ownerToken, setOwnerToken] = useState(ownerTokenParam);
  const [isOwner, setIsOwner] = useState(Boolean(ownerTokenParam));
  const [exporting, setExporting] = useState(false);
  const [statusSaving, setStatusSaving] = useState('');
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
        setError(configError || 'App configuration is unavailable.');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const localOwnerToken = ownerTokenParam || (() => {
          try {
            return window.localStorage.getItem(`translate:owner-token:${shareId}`) ?? '';
          } catch {
            return '';
          }
        })();
        const nextProject = await fetchProject(shareId, {
          ownerToken: localOwnerToken
        });

        if (!isMounted) {
          return;
        }

        setOwnerToken(localOwnerToken);
        setIsOwner(Boolean(nextProject.isOwner));
        setProject(nextProject);
        setVideoUrl(nextProject.playbackUrl);
        setShareUrl(nextProject.shareUrl);
        setProjectTitle(nextProject.title || 'Shared animation review');
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
  }, [config, configError, configLoading, ownerTokenParam, shareId]);

  async function handleExportReport() {
    if (!isOwner || !shareId) {
      return;
    }

    setExporting(true);
    setError('');

    try {
      const [{ downloadProjectReport }, project, notes, annotations] = await Promise.all([
        import('../lib/report.js'),
        fetchProject(shareId, { ownerToken }),
        fetchNotes(shareId),
        fetchAnnotations(shareId)
      ]);

      downloadProjectReport({
        annotations,
        notes,
        project,
        shareUrl: project.shareUrl
      });
    } catch (exportError) {
      setError(`Export failed: ${exportError.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleStatusChange(status) {
    setStatusSaving(status);
    setError('');

    try {
      const nextProject = await updateProjectStatus(shareId, status, ownerToken);
      setProject((currentProject) => ({
        ...currentProject,
        ...nextProject,
        isOwner
      }));
    } catch (statusError) {
      setError(`Status update failed: ${statusError.message}`);
    } finally {
      setStatusSaving('');
    }
  }

  const projectStatus = project?.status ?? 'in_review';
  const brandAccent = project?.brandAccent ?? '#d6a15f';
  const portalBrand = project?.brandName || 'Reframe Review';

  return (
    <AppShell
      eyebrow="Review Link"
      title={isOwner ? 'Animator workspace.' : 'Client review room.'}
      description={
        isOwner
          ? 'Owner controls are unlocked here: translate notes, clean up annotations, and export a production report.'
          : 'A focused review link for playback, timestamped notes, and paused-frame annotation without extra production controls.'
      }
      asideLines={[
        `Share ID: ${shareId}`,
        isOwner ? 'Owner token confirmed for animator-only tools.' : 'Client mode keeps report and AI controls locked.',
        'Paused frames unlock pen, circle, and arrow tools with Supabase-backed timestamps.',
        'Notes remain chronological and clickable for fast creative review.'
      ]}
    >
      <div
        className="panel flex flex-1 flex-col gap-6 p-6 sm:p-8"
        style={{ '--portal-accent': brandAccent }}
      >
        <div className="flex flex-col gap-4 border-b border-stone-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-stone-700 bg-black/25 px-4 py-2 text-xs uppercase tracking-[0.24em] text-stone-200">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--portal-accent)] shadow-[0_0_22px_var(--portal-accent)]" />
              {portalBrand}
            </div>
            <p className="label">{isOwner ? 'Owner Player' : 'Review Player'}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{projectTitle}</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-stone-400">
              <span className={getStatusBadgeClassName(projectStatus)}>
                {projectStatus.replace(/_/g, ' ')}
              </span>
              <span className="rounded-full border border-stone-700 bg-black/25 px-3 py-1.5">
                {project?.versionLabel ?? 'Version 1'}
              </span>
              {project?.clientName ? (
                <span className="rounded-full border border-stone-700 bg-black/25 px-3 py-1.5">
                  {project.clientName}
                </span>
              ) : null}
              <span className="rounded-full border border-stone-700 bg-black/25 px-3 py-1.5">
                {formatDeadline(project?.dueAt)}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              className="inline-flex items-center justify-center rounded-full border border-rose-300/25 bg-rose-300/[0.08] px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-300/[0.14] disabled:opacity-60"
              disabled={Boolean(statusSaving)}
              onClick={() => handleStatusChange('changes_requested')}
              type="button"
            >
              {statusSaving === 'changes_requested' ? 'Saving…' : 'Request Changes'}
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-300/[0.14] disabled:opacity-60"
              disabled={Boolean(statusSaving)}
              onClick={() => handleStatusChange('approved')}
              type="button"
            >
              {statusSaving === 'approved' ? 'Saving…' : 'Approve'}
            </button>
            {isOwner ? (
              <>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-4 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/[0.14] disabled:opacity-60"
                  disabled={Boolean(statusSaving)}
                  onClick={() => handleStatusChange('final_delivered')}
                  type="button"
                >
                  {statusSaving === 'final_delivered' ? 'Saving…' : 'Final Delivered'}
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-4 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/[0.14] disabled:opacity-60"
                  disabled={exporting}
                  onClick={handleExportReport}
                  type="button"
                >
                  {exporting ? 'Building PDF…' : 'Export Report'}
                </button>
              </>
            ) : null}
            <Link
              className="inline-flex items-center justify-center rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-stone-500 hover:bg-white/[0.04]"
              to="/"
            >
              Upload another clip
            </Link>
          </div>
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
                isOwner={isOwner}
                openAiConfigured={config?.openAiConfigured ?? false}
                ownerToken={ownerToken}
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
