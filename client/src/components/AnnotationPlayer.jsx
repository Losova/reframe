import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import {
  fetchAnnotations,
  fetchNotes,
  saveAnnotation,
  saveNote,
  saveNoteTranslation
} from '../lib/api.js';
import { translateClientNote } from '../lib/openai.js';

const TOOL_OPTIONS = [
  { id: 'none', label: 'View' },
  { id: 'pen', label: 'Pen' },
  { id: 'circle', label: 'Circle' },
  { id: 'arrow', label: 'Arrow' }
];
const DRAW_COLOR = '#67e8f9';
const DRAW_STROKE_WIDTH = 4;
const MIN_CIRCLE_RADIUS = 12;
const MIN_ARROW_LENGTH = 18;
const SESSION_STORAGE_KEY = 'reframe:session-id';

function getOrCreateSessionId() {
  try {
    const existingSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (existingSessionId) {
      return existingSessionId;
    }

    const nextSessionId = window.crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    return nextSessionId;
  } catch {
    return window.crypto.randomUUID();
  }
}

function formatTimestamp(timestampMs) {
  const wholeSeconds = Math.floor(timestampMs / 1000);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  const centiseconds = Math.floor((timestampMs % 1000) / 10);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(centiseconds).padStart(2, '0')}`;
}

function formatTimestampBadge(timestampSeconds) {
  const totalSeconds = Math.max(0, Math.floor(timestampSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sortAnnotations(annotations) {
  return [...annotations].sort((left, right) => {
    if (left.timestampMs !== right.timestampMs) {
      return left.timestampMs - right.timestampMs;
    }

    return (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
  });
}

function mergeAnnotations(...collections) {
  const records = new Map();

  collections.flat().forEach((annotation) => {
    records.set(annotation.id, annotation);
  });

  return sortAnnotations([...records.values()]);
}

function sortNotes(notes) {
  return [...notes].sort((left, right) => {
    if (left.timestampSeconds !== right.timestampSeconds) {
      return left.timestampSeconds - right.timestampSeconds;
    }

    return (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
  });
}

function mergeNotes(...collections) {
  const records = new Map();

  collections.flat().forEach((note) => {
    records.set(note.id, note);
  });

  return sortNotes([...records.values()]);
}

function applyObjectDefaults(object) {
  object.set({
    evented: false,
    hasBorders: false,
    hasControls: false,
    hoverCursor: 'default',
    selectable: false
  });

  return object;
}

function serializeAnnotationObject(object) {
  applyObjectDefaults(object);

  return object.toObject([
    'evented',
    'hasBorders',
    'hasControls',
    'hoverCursor',
    'selectable'
  ]);
}

function scaleAnnotationPayload(
  payload,
  originalWidth,
  originalHeight,
  nextWidth,
  nextHeight
) {
  const scaleX = nextWidth / (originalWidth || nextWidth || 1);
  const scaleY = nextHeight / (originalHeight || nextHeight || 1);

  return {
    ...payload,
    left:
      typeof payload.left === 'number' ? payload.left * scaleX : payload.left,
    top: typeof payload.top === 'number' ? payload.top * scaleY : payload.top,
    scaleX: (payload.scaleX ?? 1) * scaleX,
    scaleY: (payload.scaleY ?? 1) * scaleY
  };
}

function buildArrowPathData(startPoint, endPoint) {
  const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
  const headLength = 20;
  const headSpread = Math.PI / 7;
  const leftHead = {
    x: endPoint.x - headLength * Math.cos(angle - headSpread),
    y: endPoint.y - headLength * Math.sin(angle - headSpread)
  };
  const rightHead = {
    x: endPoint.x - headLength * Math.cos(angle + headSpread),
    y: endPoint.y - headLength * Math.sin(angle + headSpread)
  };

  return [
    `M ${startPoint.x} ${startPoint.y}`,
    `L ${endPoint.x} ${endPoint.y}`,
    `M ${endPoint.x} ${endPoint.y}`,
    `L ${leftHead.x} ${leftHead.y}`,
    `M ${endPoint.x} ${endPoint.y}`,
    `L ${rightHead.x} ${rightHead.y}`
  ].join(' ');
}

function createArrowPath(startPoint, endPoint) {
  return applyObjectDefaults(
    new fabric.Path(buildArrowPathData(startPoint, endPoint), {
      fill: '',
      stroke: DRAW_COLOR,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      strokeWidth: DRAW_STROKE_WIDTH
    })
  );
}

function applyCanvasMode(canvas, isPaused, activeTool) {
  const interactive = isPaused && activeTool !== 'none';

  canvas.isDrawingMode = interactive && activeTool === 'pen';
  canvas.selection = false;
  canvas.skipTargetFind = true;
  canvas.defaultCursor = interactive ? 'crosshair' : 'default';

  canvas.wrapperEl.style.pointerEvents = interactive ? 'auto' : 'none';
  canvas.upperCanvasEl.style.pointerEvents = interactive ? 'auto' : 'none';
  canvas.lowerCanvasEl.style.pointerEvents = 'none';

  if (canvas.isDrawingMode) {
    if (!(canvas.freeDrawingBrush instanceof fabric.PencilBrush)) {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    }

    canvas.freeDrawingBrush.color = DRAW_COLOR;
    canvas.freeDrawingBrush.width = DRAW_STROKE_WIDTH;
  }
}

export default function AnnotationPlayer({
  annotationBucketMs,
  shareId,
  shareUrl,
  videoUrl
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [annotations, setAnnotations] = useState([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(true);
  const [annotationsError, setAnnotationsError] = useState('');
  const [annotationSaveError, setAnnotationSaveError] = useState('');
  const [pendingAnnotationSaves, setPendingAnnotationSaves] = useState(0);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaveError, setNoteSaveError] = useState('');
  const [pendingNoteSaves, setPendingNoteSaves] = useState(0);
  const [translatingNoteId, setTranslatingNoteId] = useState('');
  const [noteTranslationError, setNoteTranslationError] = useState('');
  const [isPaused, setIsPaused] = useState(true);
  const [activeTool, setActiveTool] = useState('none');
  const [currentBucket, setCurrentBucket] = useState(0);
  const [currentTimestampMs, setCurrentTimestampMs] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const annotationsAtCurrentTimestamp = annotations.filter(
    (annotation) => annotation.timestampBucket === currentBucket
  );

  useEffect(() => {
    let isMounted = true;

    async function loadAnnotations() {
      setAnnotationsLoading(true);
      setAnnotationsError('');
      setAnnotations([]);

      try {
        const nextAnnotations = await fetchAnnotations(shareId);

        if (!isMounted) {
          return;
        }

        setAnnotations(sortAnnotations(nextAnnotations));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setAnnotationsError(error.message);
      } finally {
        if (isMounted) {
          setAnnotationsLoading(false);
        }
      }
    }

    loadAnnotations();

    return () => {
      isMounted = false;
    };
  }, [shareId]);

  useEffect(() => {
    let isMounted = true;

    async function loadNotes() {
      setNotesLoading(true);
      setNotesError('');
      setNotes([]);

      try {
        const nextNotes = await fetchNotes(shareId);

        if (!isMounted) {
          return;
        }

        setNotes(sortNotes(nextNotes));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setNotesError(error.message);
      } finally {
        if (isMounted) {
          setNotesLoading(false);
        }
      }
    }

    loadNotes();

    return () => {
      isMounted = false;
    };
  }, [shareId]);

  useEffect(() => {
    const canvasElement = canvasRef.current;

    if (!canvasElement) {
      return undefined;
    }

    const canvas = new fabric.Canvas(canvasElement, {
      preserveObjectStacking: true,
      selection: false
    });

    canvas.wrapperEl.style.height = '100%';
    canvas.wrapperEl.style.inset = '0';
    canvas.wrapperEl.style.position = 'absolute';
    canvas.wrapperEl.style.width = '100%';

    fabricCanvasRef.current = canvas;
    applyCanvasMode(canvas, isPaused, activeTool);

    return () => {
      fabricCanvasRef.current = null;
      canvas.dispose();
    };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    const canvasContainer = canvasContainerRef.current;

    if (!canvas || !canvasContainer) {
      return undefined;
    }

    function syncCanvasSize() {
      const nextWidth = Math.round(canvasContainer.clientWidth);
      const nextHeight = Math.round(canvasContainer.clientHeight);

      if (!nextWidth || !nextHeight) {
        return;
      }

      canvas.setDimensions({
        height: nextHeight,
        width: nextWidth
      });
      canvas.calcOffset();

      setCanvasSize((currentSize) => {
        if (
          currentSize.width === nextWidth &&
          currentSize.height === nextHeight
        ) {
          return currentSize;
        }

        return {
          width: nextWidth,
          height: nextHeight
        };
      });
    }

    syncCanvasSize();

    const resizeObserver = new ResizeObserver(syncCanvasSize);
    resizeObserver.observe(canvasContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    applyCanvasMode(canvas, isPaused, activeTool);
    canvas.requestRenderAll();
  }, [activeTool, isPaused]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas || !canvasSize.width || !canvasSize.height) {
      return undefined;
    }

    let cancelled = false;
    const serializedObjects = annotationsAtCurrentTimestamp.map((annotation) =>
      scaleAnnotationPayload(
        annotation.payload,
        annotation.canvasWidth,
        annotation.canvasHeight,
        canvasSize.width,
        canvasSize.height
      )
    );

    canvas.clear();

    canvas
      .loadFromJSON({
        objects: serializedObjects
      })
      .then(() => {
        if (cancelled) {
          return;
        }

        canvas.getObjects().forEach((object) => {
          applyObjectDefaults(object);
        });
        applyCanvasMode(canvas, isPaused, activeTool);
        canvas.requestRenderAll();
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setAnnotationSaveError(
          'Unable to render the saved annotations on this frame.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTool,
    annotationsAtCurrentTimestamp,
    canvasSize.height,
    canvasSize.width,
    isPaused
  ]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return undefined;
    }

    async function persistAnnotation(object, annotationType) {
      const timestampMs = Math.max(
        0,
        Math.round((videoRef.current?.currentTime ?? 0) * 1000)
      );

      setAnnotationSaveError('');
      setPendingAnnotationSaves((count) => count + 1);

      try {
        const savedAnnotation = await saveAnnotation(shareId, {
          annotationType,
          canvasHeight: Math.round(canvas.getHeight()),
          canvasWidth: Math.round(canvas.getWidth()),
          payload: serializeAnnotationObject(object),
          sessionId,
          timestampMs
        });

        setAnnotations((currentAnnotations) =>
          mergeAnnotations(currentAnnotations, savedAnnotation)
        );
      } catch (error) {
        canvas.remove(object);
        canvas.requestRenderAll();
        setAnnotationSaveError(error.message);
      } finally {
        setPendingAnnotationSaves((count) => Math.max(0, count - 1));
      }
    }

    function handlePathCreated(event) {
      if (!isPaused || activeTool !== 'pen' || !event.path) {
        return;
      }

      applyObjectDefaults(event.path);
      canvas.requestRenderAll();
      void persistAnnotation(event.path, 'pen');
    }

    canvas.on('path:created', handlePathCreated);

    return () => {
      canvas.off('path:created', handlePathCreated);
    };
  }, [activeTool, isPaused, sessionId, shareId]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas || !isPaused || !['circle', 'arrow'].includes(activeTool)) {
      return undefined;
    }

    let startPoint = null;
    let draftObject = null;

    async function persistAnnotation(object) {
      const timestampMs = Math.max(
        0,
        Math.round((videoRef.current?.currentTime ?? 0) * 1000)
      );

      setAnnotationSaveError('');
      setPendingAnnotationSaves((count) => count + 1);

      try {
        const savedAnnotation = await saveAnnotation(shareId, {
          annotationType: activeTool,
          canvasHeight: Math.round(canvas.getHeight()),
          canvasWidth: Math.round(canvas.getWidth()),
          payload: serializeAnnotationObject(object),
          sessionId,
          timestampMs
        });

        setAnnotations((currentAnnotations) =>
          mergeAnnotations(currentAnnotations, savedAnnotation)
        );
      } catch (error) {
        canvas.remove(object);
        canvas.requestRenderAll();
        setAnnotationSaveError(error.message);
      } finally {
        setPendingAnnotationSaves((count) => Math.max(0, count - 1));
      }
    }

    function resetDraft() {
      startPoint = null;
      draftObject = null;
    }

    function handleMouseDown(event) {
      startPoint = event.scenePoint;

      if (!startPoint) {
        return;
      }

      if (activeTool === 'circle') {
        draftObject = applyObjectDefaults(
          new fabric.Circle({
            fill: 'rgba(0, 0, 0, 0)',
            left: startPoint.x,
            originX: 'center',
            originY: 'center',
            radius: 1,
            stroke: DRAW_COLOR,
            strokeWidth: DRAW_STROKE_WIDTH,
            top: startPoint.y
          })
        );
        canvas.add(draftObject);
      }

      if (activeTool === 'arrow') {
        draftObject = createArrowPath(startPoint, startPoint);
        canvas.add(draftObject);
      }
    }

    function handleMouseMove(event) {
      if (!startPoint || !event.scenePoint) {
        return;
      }

      if (activeTool === 'circle' && draftObject) {
        const radius = Math.hypot(
          event.scenePoint.x - startPoint.x,
          event.scenePoint.y - startPoint.y
        );

        draftObject.set({
          left: startPoint.x,
          radius,
          top: startPoint.y
        });
        canvas.requestRenderAll();
      }

      if (activeTool === 'arrow') {
        if (draftObject) {
          canvas.remove(draftObject);
        }

        draftObject = createArrowPath(startPoint, event.scenePoint);
        canvas.add(draftObject);
        canvas.requestRenderAll();
      }
    }

    function handleMouseUp(event) {
      if (!startPoint || !draftObject || !event.scenePoint) {
        resetDraft();
        return;
      }

      if (activeTool === 'circle') {
        if ((draftObject.radius ?? 0) < MIN_CIRCLE_RADIUS) {
          canvas.remove(draftObject);
          canvas.requestRenderAll();
          resetDraft();
          return;
        }
      }

      if (activeTool === 'arrow') {
        const arrowLength = Math.hypot(
          event.scenePoint.x - startPoint.x,
          event.scenePoint.y - startPoint.y
        );

        if (arrowLength < MIN_ARROW_LENGTH) {
          canvas.remove(draftObject);
          canvas.requestRenderAll();
          resetDraft();
          return;
        }
      }

      void persistAnnotation(draftObject);
      resetDraft();
    }

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [activeTool, isPaused, sessionId, shareId]);

  useEffect(() => {
    if (isPaused) {
      return undefined;
    }

    let animationFrameId = 0;

    function syncCurrentTime() {
      const nextTimestampMs = Math.max(
        0,
        Math.round((videoRef.current?.currentTime ?? 0) * 1000)
      );
      const nextBucket = Math.round(nextTimestampMs / annotationBucketMs);

      setCurrentTimestampMs((currentTimestamp) =>
        currentTimestamp === nextTimestampMs ? currentTimestamp : nextTimestampMs
      );
      setCurrentBucket((previousBucket) =>
        previousBucket === nextBucket ? previousBucket : nextBucket
      );

      animationFrameId = window.requestAnimationFrame(syncCurrentTime);
    }

    syncCurrentTime();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [annotationBucketMs, isPaused]);

  function syncTimeFromVideo() {
    const nextTimestampMs = Math.max(
      0,
      Math.round((videoRef.current?.currentTime ?? 0) * 1000)
    );

    setCurrentTimestampMs(nextTimestampMs);
    setCurrentBucket(Math.round(nextTimestampMs / annotationBucketMs));
  }

  function seekVideo(timestampSeconds) {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = Math.max(0, timestampSeconds);
    syncTimeFromVideo();
  }

  async function handleNoteSubmit(event) {
    event.preventDefault();

    const trimmedNote = noteDraft.trim();

    if (!trimmedNote) {
      return;
    }

    const timestampSeconds = Number(
      Math.max(0, videoRef.current?.currentTime ?? currentTimestampMs / 1000).toFixed(
        3
      )
    );

    setNoteSaveError('');
    setPendingNoteSaves((count) => count + 1);

    try {
      const savedNote = await saveNote(shareId, {
        noteText: trimmedNote,
        sessionId,
        timestampSeconds
      });

      setNotes((currentNotes) => mergeNotes(currentNotes, savedNote));
      setNoteDraft('');
    } catch (error) {
      setNoteSaveError(error.message);
    } finally {
      setPendingNoteSaves((count) => Math.max(0, count - 1));
    }
  }

  async function handleTranslateNote(note) {
    setNoteTranslationError('');
    setTranslatingNoteId(note.id);

    try {
      const aiTranslation = await translateClientNote(note.noteText);
      const savedNote = await saveNoteTranslation(shareId, note.id, aiTranslation);

      setNotes((currentNotes) => mergeNotes(currentNotes, savedNote));
    } catch (error) {
      setNoteTranslationError(error.message);
    } finally {
      setTranslatingNoteId('');
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {isPaused ? (
            <div className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="label text-cyan-100">Annotation Tools</p>
                  <p className="mt-2 text-sm leading-7 text-cyan-50/90">
                    Paused at <span className="mono">{formatTimestamp(currentTimestampMs)}</span>. Pick a tool to draw on this frame group.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {TOOL_OPTIONS.map((tool) => (
                    <button
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        activeTool === tool.id
                          ? 'border-cyan-200 bg-cyan-100 text-slate-950'
                          : 'border-white/10 bg-black/20 text-slate-200 hover:border-cyan-200/30 hover:bg-white/[0.04]'
                      }`}
                      key={tool.id}
                      onClick={() => setActiveTool(tool.id)}
                      type="button"
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 px-5 py-4">
              <p className="label">Playback</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                Annotations appear automatically as the playhead crosses their saved timestamps. Pause anytime to add more notes.
              </p>
            </div>
          )}

          <div
            className="relative aspect-video overflow-hidden rounded-[1.75rem] border border-white/10 bg-black"
            ref={canvasContainerRef}
          >
            <video
              className="absolute inset-0 h-full w-full bg-black object-contain"
              controls
              onLoadedMetadata={syncTimeFromVideo}
              onPause={() => {
                setIsPaused(true);
                syncTimeFromVideo();
              }}
              onPlay={() => setIsPaused(false)}
              onSeeked={syncTimeFromVideo}
              playsInline
              preload="metadata"
              ref={videoRef}
              src={videoUrl}
            />

            <div className="absolute inset-0 z-10">
              <canvas ref={canvasRef} />
            </div>

            <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-200 backdrop-blur">
              {isPaused ? 'Paused / annotate' : 'Playing / review'}
            </div>
          </div>
        </div>

        <aside className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
          <div className="flex h-full min-h-[42rem] flex-col">
            <div className="border-b border-white/10 pb-5">
              <p className="label">Review Notes</p>
              <div className="mt-4 grid gap-4">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                  <p className="label">Current Time</p>
                  <p className="mono mt-3 text-xl text-cyan-100">
                    {formatTimestampBadge(currentTimestampMs / 1000)}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    {notes.length} notes saved for this share link.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <p className="label">Session</p>
                    <p className="mono mt-3 break-all text-xs text-cyan-100">
                      {sessionId}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <p className="label">Sync</p>
                    <div className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                      <p>{annotations.length} annotations recorded.</p>
                      <p>{annotationsAtCurrentTimestamp.length} visible on this frame group.</p>
                      <p className="mono text-slate-400">
                        Bucket: {formatTimestamp(currentBucket * annotationBucketMs)}
                      </p>
                    </div>
                  </div>
                </div>
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
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                      Loading notes…
                    </div>
                  ) : null}

                  {!notesLoading && notes.length === 0 ? (
                    <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm leading-7 text-slate-400">
                      No notes yet. Press Enter in the input below to capture feedback at the current timestamp.
                    </div>
                  ) : null}

                  {notes.map((note) => (
                    <article
                      className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4"
                      key={note.id}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          className="mono shrink-0 rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/[0.16]"
                          onClick={() => seekVideo(note.timestampSeconds)}
                          type="button"
                        >
                          {formatTimestampBadge(note.timestampSeconds)}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-7 text-slate-200">
                                {note.noteText}
                              </p>
                              <p className="mono mt-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                Session {note.sessionId.slice(0, 8)}
                              </p>
                            </div>

                            <button
                              className="shrink-0 rounded-full border border-amberGlow/25 bg-amberGlow/[0.08] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-amber-100 transition hover:border-amberGlow/40 hover:bg-amberGlow/[0.16] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={translatingNoteId === note.id}
                              onClick={() => handleTranslateNote(note)}
                              type="button"
                            >
                              {translatingNoteId === note.id
                                ? 'Translating'
                                : note.aiTranslation
                                  ? 'Retranslate'
                                  : 'Translate'}
                            </button>
                          </div>

                          {note.aiTranslation ? (
                            <div className="mt-4 rounded-[1.35rem] border border-cyan-300/20 bg-cyan-300/[0.08] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="label text-cyan-100">AI Translation</p>
                                <span className="rounded-full border border-cyan-200/25 bg-black/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cyan-50">
                                  {note.aiTranslation.tone}
                                </span>
                              </div>

                              <p className="mt-3 text-sm leading-7 text-cyan-50">
                                {note.aiTranslation.summary}
                              </p>

                              <div className="mt-4 space-y-2">
                                {note.aiTranslation.actions.map((action) => (
                                  <div
                                    className="flex items-start gap-3 text-sm leading-7 text-slate-100"
                                    key={action}
                                  >
                                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-amberGlow" />
                                    <p>{action}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-5">
              <p className="label">Add Note</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                Capture feedback while paused or playing. The current video time is saved automatically.
              </p>

              <form className="mt-4" onSubmit={handleNoteSubmit}>
                <input
                  className="w-full rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/40 focus:bg-white/[0.06]"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder={`Add a note at ${formatTimestampBadge(currentTimestampMs / 1000)} and press Enter`}
                  type="text"
                  value={noteDraft}
                />
              </form>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
              <p className="label">Review Link</p>
              <p className="mono mt-3 break-all text-sm text-slate-300">{shareUrl}</p>
            </div>
          </div>
        </aside>
      </div>

      {annotationsLoading ? (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-slate-300">
          Loading saved annotations…
        </div>
      ) : null}

      {pendingAnnotationSaves > 0 ? (
        <div className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/[0.06] px-5 py-4 text-sm text-cyan-50">
          Saving annotation to Supabase…
        </div>
      ) : null}

      {pendingNoteSaves > 0 ? (
        <div className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/[0.06] px-5 py-4 text-sm text-cyan-50">
          Saving note to Supabase…
        </div>
      ) : null}

      {annotationsError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {annotationsError}
        </div>
      ) : null}

      {notesError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {notesError}
        </div>
      ) : null}

      {annotationSaveError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {annotationSaveError}
        </div>
      ) : null}

      {noteSaveError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {noteSaveError}
        </div>
      ) : null}

      {noteTranslationError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {noteTranslationError}
        </div>
      ) : null}
    </div>
  );
}
