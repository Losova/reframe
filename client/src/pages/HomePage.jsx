import { useState } from 'react';
import AppShell from '../components/AppShell.jsx';
import { uploadVideo, fetchNotes, fetchAnnotations } from '../lib/api.js';

function formatFileSize(bytes) {
  if (!bytes) {
    return '0 MB';
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getShareId(shareUrl) {
  const parts = shareUrl.split('/');
  return parts[parts.length - 1];
}

async function generateReport(shareUrl) {
  const shareId = getShareId(shareUrl);
  const [notes, annotations] = await Promise.all([
    fetchNotes(shareId).catch(() => []),
    fetchAnnotations(shareId).catch(() => [])
  ]);

  const notesHtml = notes.length === 0
    ? '<p style="color:#94a3b8;font-style:italic;">No notes recorded yet.</p>'
    : notes.map((note) => {
        const ts = typeof note.timestampSeconds === 'number'
          ? formatTime(note.timestampSeconds)
          : (typeof note.timestamp_seconds === 'number' ? formatTime(note.timestamp_seconds) : '0:00');
        const text = note.noteText || note.note_text || '';
        const ai = note.aiTranslation || note.ai_translation;

        let aiHtml = '';
        if (ai && ai.summary) {
          const actionsHtml = Array.isArray(ai.actions)
            ? `<ul style="margin:8px 0 0 0;padding-left:20px;color:#cbd5e1;">${ai.actions.map(a => `<li style="margin:4px 0;">${a}</li>`).join('')}</ul>`
            : '';
          aiHtml = `
            <div style="margin-top:12px;padding:12px 16px;background:#0f172a;border-left:3px solid #22d3ee;border-radius:8px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:#22d3ee;text-transform:uppercase;">AI Translation</span>
                ${ai.tone ? `<span style="font-size:10px;background:#164e63;color:#67e8f9;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:0.08em;">${ai.tone}</span>` : ''}
              </div>
              <p style="margin:0;color:#f1f5f9;font-weight:500;">${ai.summary}</p>
              ${actionsHtml}
            </div>`;
        }

        return `
          <div style="margin-bottom:20px;padding:16px;background:#1e293b;border-radius:12px;border:1px solid #334155;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:11px;background:#0e7490;color:#cffafe;padding:3px 10px;border-radius:20px;font-weight:700;letter-spacing:0.05em;">${ts}</span>
              <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">Client Note</span>
            </div>
            <p style="margin:0;color:#e2e8f0;">${text}</p>
            ${aiHtml}
          </div>`;
      }).join('');

  const annotationList = annotations.length === 0
    ? '<p style="color:#94a3b8;font-style:italic;">No drawing annotations recorded.</p>'
    : annotations.map((a) => {
        const ts = typeof a.timestampMs === 'number'
          ? formatTime(a.timestampMs / 1000)
          : (typeof a.timestamp_ms === 'number' ? formatTime(a.timestamp_ms / 1000) : '0:00');
        const type = a.annotationType || a.annotation_type || 'drawing';
        return `<div style="display:inline-block;margin:4px;padding:4px 12px;background:#1e293b;border:1px solid #334155;border-radius:20px;font-size:12px;color:#94a3b8;">${ts} &mdash; ${type}</div>`;
      }).join('');

  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Reframe Feedback Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div style="max-width:800px;margin:0 auto;padding:40px 32px;">
    <div style="background:linear-gradient(135deg,#0e7490,#1e40af);border-radius:16px;padding:32px;margin-bottom:32px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.2em;color:#67e8f9;text-transform:uppercase;margin-bottom:8px;">Reframe &mdash; Feedback Report</div>
      <h1 style="font-size:28px;font-weight:700;color:#fff;margin-bottom:8px;">Animation Review Session</h1>
      <p style="color:#bae6fd;font-size:14px;">Generated ${now}</p>
      <p style="margin-top:12px;font-size:12px;color:#93c5fd;word-break:break-all;">Review URL: ${shareUrl}</p>
    </div>

    <div style="margin-bottom:32px;">
      <h2 style="font-size:16px;font-weight:700;color:#22d3ee;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        Client Notes &amp; AI Translations
      </h2>
      ${notesHtml}
    </div>

    <div>
      <h2 style="font-size:16px;font-weight:700;color:#22d3ee;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        Drawing Annotations
      </h2>
      ${annotationList}
    </div>

    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #1e293b;font-size:11px;color:#475569;text-align:center;">
      Generated by Reframe &mdash; Animation Feedback Platform
    </div>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
}

export default function HomePage({ configLoading, configError }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isDisabled = uploading || configLoading;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedFile) {
      setError('Choose an MP4 file before uploading.');
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);
    setCopied(false);
    try {
      const payload = await uploadVideo(selectedFile);
      setResult(payload);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
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
    if (!result?.shareUrl) return;
    setExporting(true);
    try {
      const html = await generateReport(result.shareUrl);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (err) {
      setError('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      eyebrow="Animation Review Flow"
      title="Upload dailies and hand off a clean viewing link."
      description="Reframe is built for animators moving fast. Drop in an MP4, let the backend publish it to Supabase, then send a polished review page without digging through raw storage URLs."
      asideLines={[
        'Backend-managed uploads keep the service role key off the client.',
        'Every upload gets a unique share route for instant handoff.',
        'Playback pages stay minimal so the work stays centered.'
      ]}
    >
      <div className="panel flex flex-1 flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="label">Uploader</p>
            <h2 className="text-2xl font-semibold text-white">Publish a review-ready MP4</h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-300">
              The file is uploaded through Express, stored in Supabase Storage, and returned as a unique shareable URL.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs uppercase tracking-[0.2em] text-slate-400">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">MP4 Only</div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">Dark UI</div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">Share Link</div>
          </div>
        </div>
        <form className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]" onSubmit={handleSubmit}>
          <div className="space-y-5">
            <label
              className={`group block cursor-pointer rounded-[1.75rem] border border-dashed p-8 transition ${
                isDisabled
                  ? 'border-white/10 bg-white/[0.03]'
                  : 'border-cyan-300/30 bg-cyan-300/[0.05] hover:border-cyan-300/60 hover:bg-cyan-300/[0.08]'
              }`}
              htmlFor="video-upload"
            >
              <input
                accept="video/mp4,.mp4"
                className="sr-only"
                disabled={isDisabled}
                id="video-upload"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <div className="space-y-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-2xl text-cyan-200">
                  +
                </div>
                <div>
                  <p className="text-xl font-medium text-white">Choose an MP4 from your workstation</p>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-slate-300">
                    Built for quick dailies, turntables, and blocking passes. The server validates the format and uploads the file to Supabase Storage.
                  </p>
                </div>
              </div>
            </label>
            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
              <p className="label">Selected Clip</p>
              {selectedFile ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-medium text-white">{selectedFile.name}</p>
                    <p className="mono mt-1 text-xs text-slate-400">{formatFileSize(selectedFile.size)}</p>
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
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-6">
            <p className="label">Publish</p>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">
              <p>1. Upload your MP4 through the Express API.</p>
              <p>2. Store the video in the `translate-videos` bucket.</p>
              <p>3. Receive a clean route you can paste into review notes, Slack, or email.</p>
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
            <button
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-500"
              disabled={isDisabled || !selectedFile || Boolean(configError)}
              type="submit"
            >
              {uploading ? 'Uploading to Supabase…' : 'Create Share Link'}
            </button>
            {result ? (
              <div className="mt-6 rounded-[1.5rem] border border-cyan-300/30 bg-cyan-300/[0.08] p-5">
                <p className="label text-cyan-100">Share URL</p>
                <p className="mono mt-3 break-all text-sm text-cyan-50">{result.shareUrl}</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    className="rounded-full border border-cyan-200/30 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-200/10"
                    onClick={handleCopy}
                    type="button"
                  >
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                  <a
                    className="rounded-full bg-cyan-100 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-white"
                    href={result.shareUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open Player
                  </a>
                  <button
                    className="rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-50"
                    disabled={exporting}
                    onClick={handleExportReport}
                    type="button"
                  >
                    {exporting ? 'Loading…' : 'Export Report'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
