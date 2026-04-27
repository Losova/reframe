import { useState } from 'react';
import AppShell from '../components/AppShell.jsx';
import {
  createBillingCheckoutSession,
  fetchAnnotations,
  fetchNotes,
  fetchProject,
  uploadVideo
} from '../lib/api.js';

function deriveProjectTitle(filename) {
  const baseName = filename.replace(/\.mp4$/i, '');

  return baseName.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatFileSize(bytes) {
  if (!bytes) {
    return '0 MB';
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDeadlineLabel(value) {
  if (!value) {
    return 'No deadline set';
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

function ReadinessItem({ isReady, label }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-800 bg-black/25 px-4 py-3">
      <span className="text-sm text-stone-300">{label}</span>
      <span
        className={`rounded-full border px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.18em] ${
          isReady
            ? 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100'
            : 'border-stone-700 bg-stone-900 text-stone-500'
        }`}
      >
        {isReady ? 'Ready' : 'Needed'}
      </span>
    </div>
  );
}

export default function HomePage({ config, configLoading, configError }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [brandAccent, setBrandAccent] = useState('#d6a15f');
  const [brandName, setBrandName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [versionLabel, setVersionLabel] = useState('Version 1');
  const [workspaceName, setWorkspaceName] = useState('My Studio');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [billingError, setBillingError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isDisabled = uploading || configLoading;
  const previewTitle = projectTitle.trim() || 'Snowfall color pass review';
  const previewBrand = brandName.trim() || workspaceName.trim() || 'Reframe Studio';
  const previewClient = clientName.trim() || 'Client review guest';
  const previewDeadline = formatDeadlineLabel(dueAt);
  const readyItems = [
    {
      isReady: Boolean(selectedFile),
      label: 'MP4 selected'
    },
    {
      isReady: Boolean(projectTitle.trim()),
      label: 'Project title'
    },
    {
      isReady: Boolean(clientName.trim() || clientEmail.trim()),
      label: 'Client identity'
    },
    {
      isReady: Boolean(brandName.trim()),
      label: 'Portal branding'
    }
  ];

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedFile) {
      setError('Choose an MP4 file before uploading.');
      return;
    }

    if (!projectTitle.trim()) {
      setError('Add a project title before publishing the review link.');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);
    setCopied(false);

    try {
      const payload = await uploadVideo({
        brandAccent,
        brandName,
        clientEmail,
        clientName,
        dueAt,
        file: selectedFile,
        title: projectTitle.trim(),
        versionLabel
      });

      try {
        window.localStorage.setItem(
          `translate:owner-token:${payload.shareId}`,
          payload.ownerToken
        );
      } catch {
        // Local owner hints are optional.
      }

      setResult(payload);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleStartSubscription(event) {
    event.preventDefault();

    setBillingError('');
    setBillingLoading(true);

    try {
      const payload = await createBillingCheckoutSession({
        email: billingEmail,
        workspaceName
      });

      window.location.href = payload.checkoutUrl;
    } catch (checkoutError) {
      setBillingError(checkoutError.message);
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleCopy() {
    if (!result?.shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function handleExportReport() {
    if (!result?.shareId) {
      return;
    }

    setExporting(true);
    setError('');

    try {
      const [{ downloadProjectReport }, project, notes, annotations] = await Promise.all([
        import('../lib/report.js'),
        fetchProject(result.shareId, { ownerToken: result.ownerToken }),
        fetchNotes(result.shareId),
        fetchAnnotations(result.shareId)
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

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;

    setSelectedFile(file);
    setError('');

    if (file) {
      setProjectTitle((currentTitle) =>
        currentTitle.trim() ? currentTitle : deriveProjectTitle(file.name)
      );
    }
  }

  return (
    <AppShell
      eyebrow="Animation Review Flow"
      title="A calmer review desk for animation notes."
      description="Upload a pass, send clients a focused review room, and keep animator-only tools in a separate owner workspace."
      asideLines={[
        'Client links stay simple: playback, timestamped notes, and frame marks.',
        'Owner links unlock translation, annotation cleanup, and report export.',
        'Backend-managed Supabase access keeps service credentials off the browser.'
      ]}
    >
      <div className="panel flex flex-1 flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="label">Uploader</p>
            <h2 className="text-2xl font-semibold text-white">Publish a review-ready MP4</h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-300">
              The file is uploaded through Express, stored in Supabase Storage,
              and returned as a named project with a unique shareable URL.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <p className="text-[0.6rem] uppercase tracking-[0.2em] text-stone-500">Upload Flow</p>
            <div className="grid grid-cols-3 gap-2 text-center text-[0.65rem] uppercase tracking-[0.2em] text-stone-400">
              <div
                className="flex cursor-default select-none flex-col items-center gap-1 rounded-xl border border-stone-700/70 bg-black/25 px-3 py-2.5"
                title="Step 1: Upload your MP4 file"
              >
                <span className="text-[0.5rem] text-stone-600">01</span>
                <span>MP4</span>
              </div>
              <div
                className="flex cursor-default select-none flex-col items-center gap-1 rounded-xl border border-stone-700/70 bg-black/25 px-3 py-2.5"
                title="Step 2: Your owner workspace with full controls"
              >
                <span className="text-[0.5rem] text-stone-600">02</span>
                <span>Owner</span>
              </div>
              <div
                className="flex cursor-default select-none flex-col items-center gap-1 rounded-xl border border-stone-700/70 bg-black/25 px-3 py-2.5"
                title="Step 3: Client receives a clean, focused review link"
              >
                <span className="text-[0.5rem] text-stone-600">03</span>
                <span>Client</span>
              </div>
            </div>
          </div>
        </div>

        <form
          className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]"
          onSubmit={handleSubmit}
        >
          <div className="space-y-5">
            <label
                className={`group block cursor-pointer rounded-[1.5rem] border border-dashed p-8 transition ${
                isDisabled
                  ? 'border-stone-700/70 bg-white/[0.03]'
                  : 'border-stone-600 bg-stone-900/50 hover:border-amber-200/50 hover:bg-stone-900'
              }`}
              htmlFor="video-upload"
            >
              <input
                accept="video/mp4,.mp4"
                className="sr-only"
                disabled={isDisabled}
                id="video-upload"
                onChange={handleFileChange}
                type="file"
              />

              <div className="space-y-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-700 bg-black/30 text-2xl text-amber-200">
                  +
                </div>
                <div>
                  <p className="text-xl font-medium text-white">
                    Choose an MP4 from your workstation
                  </p>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-slate-300">
                    Built for quick dailies, turntables, and blocking passes. The
                    server validates the format, saves the file to Supabase
                    Storage, and creates a reusable project record.
                  </p>
                </div>
              </div>
            </label>

            <div className="rounded-[1.5rem] border border-stone-700/70 bg-black/25 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="label">Project Title</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    This title appears in the viewer and on the exported report.
                  </p>
                </div>
                <div className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                  Required
                </div>
              </div>

              <input
                  className="mt-4 w-full rounded-[1rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="Snowfall color pass review"
                type="text"
                value={projectTitle}
              />
            </div>

            <div className="rounded-[1.5rem] border border-stone-700/70 bg-black/25 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="label">Client Portal Details</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    These fields make the review page feel like a client-ready
                    portal instead of a loose file link.
                  </p>
                </div>
                <div
                  className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-amber-100"
                  title="Studio Plan features: branded portals, PDF report export, client approval flow, and Stripe billing"
                >
                  SaaS
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-[1rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Client name"
                  type="text"
                  value={clientName}
                />
                <input
                  className="rounded-[1rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
                  onChange={(event) => setClientEmail(event.target.value)}
                  placeholder="client@company.com"
                  type="email"
                  value={clientEmail}
                />
                <input
                  className="rounded-[1rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
                  onChange={(event) => setBrandName(event.target.value)}
                  placeholder="Portal brand name"
                  type="text"
                  value={brandName}
                />
                <div className="flex gap-3">
                  <input
                    aria-label="Brand accent color"
                    className="h-12 w-14 rounded-[1rem] border border-stone-700 bg-black/30 p-2"
                    onChange={(event) => setBrandAccent(event.target.value)}
                    type="color"
                    value={brandAccent}
                  />
                  <input
                    className="min-w-0 flex-1 rounded-[1rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
                    onChange={(event) => setVersionLabel(event.target.value)}
                    placeholder="Version 1"
                    type="text"
                    value={versionLabel}
                  />
                </div>
                <label className="sm:col-span-2">
                  <span className="label">Review Deadline</span>
                  <input
                    className="mt-2 w-full rounded-[1rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
                    onChange={(event) => setDueAt(event.target.value)}
                    type="datetime-local"
                    value={dueAt}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-stone-700/70 bg-black/25 p-5">
              <p className="label">Selected Clip</p>
              {selectedFile ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-medium text-white">{selectedFile.name}</p>
                    <p className="mono mt-1 text-xs text-slate-400">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <div className="rounded-full border border-amberGlow/30 bg-amberGlow/10 px-4 py-2 text-xs uppercase tracking-[0.22em] text-amber-100">
                    Ready
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-slate-400">
                  No file selected yet. Choose one clip to create a share URL.
                </p>
              )}
            </div>

            <div className="rounded-[1.5rem] border border-stone-700/70 bg-black/25 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="label">Launch Readiness</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    A quick sanity check before this becomes a client-facing review room.
                  </p>
                </div>
                <span className="mono rounded-full border border-stone-700 px-3 py-1.5 text-xs text-stone-400">
                  {readyItems.filter((item) => item.isReady).length}/{readyItems.length}
                </span>
              </div>

              <div className="mt-4 grid gap-2">
                {readyItems.map((item) => (
                  <ReadinessItem
                    isReady={item.isReady}
                    key={item.label}
                    label={item.label}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div
              className="relative overflow-hidden rounded-[1.5rem] border border-stone-700/70 bg-black/25 p-6"
              style={{ '--preview-accent': brandAccent }}
            >
              <div className="absolute right-5 top-5 h-20 w-20 rounded-full bg-[var(--preview-accent)] opacity-20 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <p className="label">Client Preview</p>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] text-stone-300">
                    Live Draft
                  </span>
                </div>

                <div className="mt-5 rounded-[1.35rem] border border-stone-700/80 bg-stone-950/75 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-[var(--preview-accent)] shadow-[0_0_24px_var(--preview-accent)]" />
                    <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-300">
                      {previewBrand}
                    </p>
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold leading-tight tracking-[-0.04em] text-white">
                    {previewTitle}
                  </h3>
                  <div className="mt-5 grid gap-3 text-sm text-stone-300">
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-stone-800 bg-black/25 px-4 py-3">
                      <span>Reviewer</span>
                      <span className="text-stone-100">{previewClient}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-stone-800 bg-black/25 px-4 py-3">
                      <span>Version</span>
                      <span className="text-stone-100">{versionLabel.trim() || 'Version 1'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-stone-800 bg-black/25 px-4 py-3">
                      <span>Due</span>
                      <span className="text-right text-stone-100">{previewDeadline}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-stone-700/70 bg-black/25 p-6">
              <p className="label">Publish</p>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">
                <p>1. Upload the MP4 through the Express API.</p>
                <p>2. Store playback in the `reframe-videos` bucket.</p>
                <p>3. Generate separate owner and client links.</p>
              </div>

              {configLoading ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                  Loading Supabase project configuration…
                </div>
              ) : null}

              {configError ? (
                <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {configError}
                </div>
              ) : null}

              {error ? (
                <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <span
                className="mt-6 block"
                title={
                  !selectedFile
                    ? 'Select an MP4 file first'
                    : !projectTitle.trim()
                      ? 'Add a project title to continue'
                      : configError
                        ? 'Configuration error — check your Supabase setup'
                        : undefined
                }
              >
                <button
                  className="inline-flex w-full items-center justify-center rounded-full bg-stone-100 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-stone-500"
                  disabled={
                    isDisabled ||
                    !selectedFile ||
                    !projectTitle.trim() ||
                    Boolean(configError)
                  }
                  type="submit"
                >
                  {uploading ? 'Uploading to Supabase…' : 'Create Share Link'}
                </button>
              </span>

              <div className="mt-6 rounded-[1.35rem] border border-stone-700/70 bg-stone-950/70 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="label">$18/month Studio Plan</p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    Sell this as a client approval portal.
                  </p>
                </div>
                <div className="mono rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">
                  ${config?.monthlyPriceUsd ?? 18}/mo
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm leading-6 text-stone-300">
                <p>✓ Branded review pages for local businesses.</p>
                <p>✓ Client notes, frame annotations, approvals, and PDF reports.</p>
                <p>✓ Stripe Checkout-ready subscription signup.</p>
              </div>

              <form className="mt-5 space-y-3" onSubmit={handleStartSubscription}>
                <input
                  className="w-full rounded-[1rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Workspace / studio name"
                  type="text"
                  value={workspaceName}
                />
                <input
                  className="w-full rounded-[1rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
                  onChange={(event) => setBillingEmail(event.target.value)}
                  placeholder="owner@studio.com"
                  type="email"
                  value={billingEmail}
                />

                {billingError ? (
                  <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {billingError}
                  </div>
                ) : null}

                <button
                  className="inline-flex w-full items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/[0.12] px-5 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    billingLoading ||
                    configLoading ||
                    !workspaceName.trim() ||
                    !billingEmail.trim() ||
                    !config?.billingConfigured
                  }
                  type="submit"
                >
                  {billingLoading
                    ? 'Opening Stripe…'
                    : config?.billingConfigured
                      ? 'Start $18/month plan'
                      : 'Add Stripe keys to enable checkout'}
                </button>
              </form>
              </div>

              {result ? (
                <div className="mt-6 rounded-[1.35rem] border border-amber-300/25 bg-amber-300/[0.07] p-5">
                <div className="mb-5 rounded-[1.2rem] border border-emerald-300/20 bg-emerald-300/[0.08] p-4">
                  <p className="label text-emerald-100">Ready To Send</p>
                  <p className="mt-2 text-sm leading-7 text-emerald-50/90">
                    Your client link is live. Send the client view for feedback and keep
                    the owner workspace private for translation, cleanup, and report export.
                  </p>
                </div>
                <p className="label text-amber-100">Project Cockpit</p>
                <p className="mt-3 text-lg font-medium text-white">
                  {result.project?.title || 'Untitled Review'}
                </p>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-stone-700/70 bg-black/25 p-4">
                    <p className="label">Client Review Link</p>
                    <p className="mono mt-2 break-all text-xs text-stone-200">{result.shareUrl}</p>
                  </div>

                  <div className="rounded-2xl border border-stone-700/70 bg-black/25 p-4">
                    <p className="label">Animator Owner Link</p>
                    <p className="mono mt-2 break-all text-xs text-amber-100">{result.ownerUrl}</p>
                  </div>

                  <div className="grid gap-2 text-xs leading-6 text-stone-300">
                    <p>✓ Client link is safe to send for review.</p>
                    <p>✓ Owner link unlocks translation, cleanup, and export.</p>
                    <p>✓ Owner token is also saved in this browser.</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-50 transition hover:bg-white/10"
                    onClick={handleCopy}
                    type="button"
                  >
                    {copied ? 'Copied' : 'Copy Client Link'}
                  </button>

                  <a
                    className="inline-flex items-center justify-center rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-50 transition hover:bg-white/10"
                    href={result.shareUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open Client View
                  </a>

                  <a
                    className="inline-flex items-center justify-center rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-amber-100"
                    href={result.ownerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open Owner Workspace
                  </a>

                  <button
                    className="inline-flex items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-50"
                    disabled={exporting}
                    onClick={handleExportReport}
                    type="button"
                  >
                    {exporting ? 'Building PDF…' : 'Export Report'}
                  </button>
                </div>
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
