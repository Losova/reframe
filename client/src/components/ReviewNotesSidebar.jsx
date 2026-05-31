import { useDeferredValue, useState } from 'react';
import { formatTimestampBadge, formatTimestampMs } from '../lib/time.js';

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent"
    />
  );
}

function NotesSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((index) => (
        <div
          className="animate-pulse rounded-[1.35rem] border border-stone-700/70 bg-white/[0.03] p-4"
          key={index}
        >
          <div className="h-5 w-20 rounded-full bg-stone-800" />
          <div className="mt-4 h-3 w-full rounded-full bg-stone-800" />
          <div className="mt-2 h-3 w-2/3 rounded-full bg-stone-800" />
        </div>
      ))}
    </div>
  );
}

export default function ReviewNotesSidebar({
  annotationBucketMs,
  annotations,
  annotationsAtCurrentTimestampCount,
  annotationsCount,
  currentBucket,
  currentTimestampMs,
  deletingAnnotationId,
  isOwner,
  notes,
  notesLoading,
  noteSavePending,
  onDeleteAnnotation,
  onSeek,
  onSubmitNote,
  onTranslate,
  openAiConfigured,
  sessionId,
  shareUrl,
  translatingNoteId
}) {
  const [noteDraft, setNoteDraft] = useState('');
  const deferredNotes = useDeferredValue(notes);

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedNote = noteDraft.trim();

    if (!trimmedNote) {
      return;
    }

    try {
      await onSubmitNote(trimmedNote);
      setNoteDraft('');
    } catch {
      // The parent owns error banners, so we keep the draft intact on failure.
    }
  }

  return (
    <aside className="min-w-0 overflow-hidden rounded-[1.75rem] border border-stone-700/70 bg-stone-950/65 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.32)]">
      <div className="flex h-full min-h-[42rem] flex-col">
        <div className="border-b border-stone-800 pb-5">
          <p className="label">Review Notes</p>
          <div className="mt-4 grid gap-4">
            <div className="rounded-[1.35rem] border border-stone-700/70 bg-black/25 p-4">
              <p className="label">Current Time</p>
              <p className="mono mt-3 text-xl text-amber-100">
                {formatTimestampBadge(currentTimestampMs / 1000)}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                {notes.length} notes saved for this project.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[1.35rem] border border-stone-700/70 bg-black/25 p-4">
                <p className="label">Session</p>
                <p className="mono mt-3 break-all text-xs text-stone-300">
                  {sessionId}
                </p>
              </div>

              <div className="rounded-[1.35rem] border border-stone-700/70 bg-black/25 p-4">
                <p className="label">Sync</p>
                <div className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                  <p>{annotationsCount} annotations recorded.</p>
                  <p>{annotationsAtCurrentTimestampCount} visible on this frame group.</p>
                  <p className="mono text-slate-400">
                    Bucket: {formatTimestampMs(currentBucket * annotationBucketMs)}
                  </p>
                </div>
              </div>
            </div>

            {!isOwner ? (
              <div className="rounded-[1.35rem] border border-stone-700/70 bg-stone-900/70 p-4 text-sm leading-7 text-stone-300">
                Client view is open for notes and frame marks. Animator-only
                actions like AI translation, report export, and annotation cleanup
                stay behind the owner workspace.
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="label">Timestamped Notes</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Enter to save
            </p>
          </div>

          <div className="h-full max-h-[28rem] overflow-y-auto pr-1">
            <div className="space-y-3">
              {notesLoading ? (
                <NotesSkeleton />
              ) : null}

              {!notesLoading && deferredNotes.length === 0 ? (
                <div className="rounded-[1.35rem] border border-dashed border-amber-300/20 bg-amber-300/[0.04] px-4 py-6 text-sm leading-7 text-slate-300">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-black/25 text-lg text-amber-100">
                    0
                  </div>
                  <p className="font-medium text-stone-100">No feedback captured yet.</p>
                  <p className="mt-2 text-stone-400">
                    Type a note below and press Enter. Reframe will pin it to the
                    current video timestamp automatically.
                  </p>
                </div>
              ) : null}

              {deferredNotes.map((note) => (
                <article
                  className="min-w-0 overflow-hidden rounded-[1.35rem] border border-stone-700/70 bg-stone-950/70 p-4"
                  key={note.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      className="mono shrink-0 rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/[0.16]"
                      onClick={() => onSeek(note.timestampSeconds)}
                      type="button"
                    >
                      {formatTimestampBadge(note.timestampSeconds)}
                    </button>

                    {isOwner ? (
                      <button
                        className="inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-full border border-amberGlow/25 bg-amberGlow/[0.08] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-amber-100 transition hover:border-amberGlow/40 hover:bg-amberGlow/[0.16] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!openAiConfigured || translatingNoteId === note.id}
                        onClick={() => onTranslate(note)}
                        type="button"
                      >
                        {translatingNoteId === note.id ? <Spinner /> : null}
                        <span className="truncate">
                          {!openAiConfigured
                            ? 'AI Offline'
                            : translatingNoteId === note.id
                              ? 'Translating'
                              : note.aiTranslation
                                ? 'Retranslate'
                                : 'Translate'}
                        </span>
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 min-w-0">
                    <p className="break-words text-sm leading-7 text-slate-200">
                      {note.noteText}
                    </p>
                    <p className="mono mt-2 break-all text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Session {note.sessionId.slice(0, 8)}
                    </p>
                  </div>

                  {note.aiTranslation ? (
                    <div className="mt-4 min-w-0 rounded-[1.2rem] border border-stone-600/70 bg-black/35 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="label text-amber-100">AI Translation</p>
                        <span className="max-w-full rounded-full border border-amber-200/25 bg-black/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-amber-50">
                          {note.aiTranslation.tone}
                        </span>
                      </div>

                      <p className="mt-3 break-words text-sm leading-7 text-white">
                        {note.aiTranslation.summary}
                      </p>

                      <ul className="mt-4 space-y-2">
                        {note.aiTranslation.actions.map((action) => (
                          <li
                            className="flex min-w-0 items-start gap-3 text-sm leading-7 text-slate-100"
                            key={action}
                          >
                            <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-amberGlow" />
                            <span className="min-w-0 break-words">{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-stone-800 pt-5">
          <p className="label">Add Note</p>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            Capture feedback while paused or playing. The current video time is saved automatically.
          </p>

          <form className="mt-4" onSubmit={handleSubmit}>
            <input
              className="w-full rounded-[1.05rem] border border-stone-700 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-200/40 focus:bg-black/45"
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder={`Add a note at ${formatTimestampBadge(
                currentTimestampMs / 1000
              )} and press Enter`}
              type="text"
              value={noteDraft}
            />
          </form>

          {noteSavePending ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-amber-100">
              <Spinner />
              Saving note
            </div>
          ) : null}
        </div>

        <div className="mt-5 rounded-[1.35rem] border border-stone-700/70 bg-black/25 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="label">Annotations</p>
            <span className="mono text-xs text-stone-500">{annotationsCount}</span>
          </div>

          {annotations.length === 0 ? (
            <p className="text-sm leading-7 text-stone-400">
              No frame marks yet. Pause the clip to draw one.
            </p>
          ) : (
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {annotations.map((annotation) => (
                <div
                  className="flex items-center gap-2 rounded-xl border border-stone-800 bg-stone-950/70 px-3 py-2"
                  key={annotation.id}
                >
                  <button
                    className="mono rounded-full border border-stone-700 px-2.5 py-1 text-[11px] text-stone-200 transition hover:border-amber-200/40 hover:text-amber-100"
                    onClick={() => onSeek(annotation.timestampMs / 1000)}
                    type="button"
                  >
                    {formatTimestampBadge(annotation.timestampMs / 1000)}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-xs capitalize text-stone-400">
                    {annotation.annotationType}
                  </span>
                  {isOwner ? (
                    <button
                      className="rounded-full border border-stone-700 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-400 transition hover:border-rose-300/40 hover:text-rose-100 disabled:opacity-50"
                      disabled={deletingAnnotationId === annotation.id}
                      onClick={() => onDeleteAnnotation(annotation.id)}
                      type="button"
                    >
                      {deletingAnnotationId === annotation.id ? 'Deleting' : 'Delete'}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 rounded-[1.35rem] border border-stone-700/70 bg-black/25 p-4">
          <p className="label">Review Link</p>
          <p className="mono mt-3 break-all text-sm text-slate-300">{shareUrl}</p>
        </div>
      </div>
    </aside>
  );
}
