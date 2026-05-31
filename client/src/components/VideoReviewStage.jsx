import { formatTimestampMs } from '../lib/time.js';

const TOOL_OPTIONS = [
  { id: 'none', label: 'View' },
  { id: 'pen', label: 'Pen' },
  { id: 'circle', label: 'Circle' },
  { id: 'arrow', label: 'Arrow' }
];

export default function VideoReviewStage({
  activeTool,
  canvasContainerRef,
  canvasRef,
  currentTimestampMs,
  isPaused,
  onPause,
  onPlay,
  onResumePlayback,
  onSeeked,
  onToolSelect,
  videoRef,
  videoUrl
}) {
  return (
    <div className="space-y-4">
      {isPaused ? (
        <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/[0.07] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="label text-amber-100">Annotation Tools</p>
              <p className="mt-2 text-sm leading-7 text-stone-200">
                Paused at{' '}
                <span className="mono">{formatTimestampMs(currentTimestampMs)}</span>.
                Pick a tool to draw on this frame group.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {TOOL_OPTIONS.map((tool) => (
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    activeTool === tool.id
                      ? 'border-amber-200 bg-amber-100 text-stone-950'
                      : 'border-stone-700 bg-black/25 text-stone-200 hover:border-amber-200/30 hover:bg-white/[0.04]'
                  }`}
                  key={tool.id}
                  onClick={() => onToolSelect(tool.id)}
                  type="button"
                >
                  {tool.label}
                </button>
              ))}
              <button
                className="rounded-full border border-cyan-200/30 bg-cyan-300/[0.12] px-4 py-2 text-sm font-medium text-cyan-50 transition hover:border-cyan-100/60 hover:bg-cyan-300/[0.18]"
                onClick={onResumePlayback}
                type="button"
              >
                Resume playback
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-stone-700/70 bg-black/25 px-5 py-4">
          <p className="label">Playback</p>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            Annotations appear automatically as the playhead crosses their saved
            timestamps. Pause anytime to add more notes.
          </p>
        </div>
      )}

      <div
        className="relative aspect-video overflow-hidden rounded-[1.5rem] border border-stone-700/80 bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
        ref={canvasContainerRef}
      >
        <video
          className="absolute inset-0 h-full w-full bg-black object-contain"
          controls
          onLoadedMetadata={onSeeked}
          onPause={onPause}
          onPlay={onPlay}
          onSeeked={onSeeked}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={videoUrl}
        />

        <div
          className={`absolute inset-0 z-10 ${
            isPaused && activeTool !== 'none' ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <canvas ref={canvasRef} />
        </div>

        <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-full border border-stone-700 bg-black/55 px-4 py-2 text-xs uppercase tracking-[0.24em] text-stone-200 backdrop-blur">
          {isPaused ? 'Paused / annotate' : 'Playing / review'}
        </div>
      </div>
    </div>
  );
}
