import { useState } from 'react';
import ReviewNotesSidebar from './ReviewNotesSidebar.jsx';
import VideoReviewStage from './VideoReviewStage.jsx';
import { useAnnotationCanvas } from '../hooks/useAnnotationCanvas.js';
import { useReviewData } from '../hooks/useReviewData.js';
import { getOrCreateReviewSessionId } from '../lib/reviewSession.js';

export default function AnnotationPlayer({
  annotationBucketMs,
  isOwner,
  openAiConfigured,
  ownerToken,
  shareId,
  shareUrl,
  videoUrl
}) {
  const [sessionId] = useState(() => getOrCreateReviewSessionId());
  const reviewData = useReviewData({ ownerToken, shareId });
  const annotationCanvas = useAnnotationCanvas({
    annotationBucketMs,
    annotations: reviewData.annotations,
    onPersistAnnotation: (annotation) =>
      reviewData.persistAnnotation({
        ...annotation,
        sessionId
      })
  });

  async function handleNoteSubmit(noteText) {
    const timestampSeconds = Number(
      Math.max(
        0,
        annotationCanvas.videoRef.current?.currentTime ??
          annotationCanvas.currentTimestampMs / 1000
      ).toFixed(3)
    );

    return reviewData.persistNote({
      noteText,
      sessionId,
      timestampSeconds
    });
  }

  function handleResumePlayback() {
    annotationCanvas.setActiveTool('none');
    annotationCanvas.setIsPaused(false);

    const video = annotationCanvas.videoRef.current;

    if (video) {
      void video.play();
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <VideoReviewStage
          activeTool={annotationCanvas.activeTool}
          canvasContainerRef={annotationCanvas.canvasContainerRef}
          canvasRef={annotationCanvas.canvasRef}
          currentTimestampMs={annotationCanvas.currentTimestampMs}
          isPaused={annotationCanvas.isPaused}
          onPause={() => {
            annotationCanvas.setIsPaused(true);
            annotationCanvas.syncTimeFromVideo();
          }}
          onPlay={() => annotationCanvas.setIsPaused(false)}
          onResumePlayback={handleResumePlayback}
          onSeeked={annotationCanvas.syncTimeFromVideo}
          onToolSelect={annotationCanvas.setActiveTool}
          videoRef={annotationCanvas.videoRef}
          videoUrl={videoUrl}
        />

        <ReviewNotesSidebar
          annotationBucketMs={annotationBucketMs}
          annotationsAtCurrentTimestampCount={
            annotationCanvas.annotationsAtCurrentTimestampCount
          }
          annotations={reviewData.annotations}
          annotationsCount={reviewData.annotations.length}
          currentBucket={annotationCanvas.currentBucket}
          currentTimestampMs={annotationCanvas.currentTimestampMs}
          deletingAnnotationId={reviewData.deletingAnnotationId}
          isOwner={isOwner}
          noteSavePending={reviewData.pendingNoteSaves > 0}
          notes={reviewData.notes}
          notesLoading={reviewData.notesLoading}
          onDeleteAnnotation={reviewData.removeAnnotation}
          onSeek={annotationCanvas.seekVideo}
          onSubmitNote={handleNoteSubmit}
          onTranslate={reviewData.translateReviewNote}
          openAiConfigured={openAiConfigured}
          sessionId={sessionId}
          shareUrl={shareUrl}
          translatingNoteId={reviewData.translatingNoteId}
        />
      </div>

      {reviewData.annotationsLoading ? (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-slate-300">
          Loading saved annotations…
        </div>
      ) : null}

      {reviewData.pendingAnnotationSaves > 0 ? (
        <div className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/[0.06] px-5 py-4 text-sm text-cyan-50">
          Saving annotation to Supabase…
        </div>
      ) : null}

      {reviewData.annotationsError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {reviewData.annotationsError}
        </div>
      ) : null}

      {reviewData.notesError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {reviewData.notesError}
        </div>
      ) : null}

      {annotationCanvas.canvasError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {annotationCanvas.canvasError}
        </div>
      ) : null}

      {reviewData.annotationSaveError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {reviewData.annotationSaveError}
        </div>
      ) : null}

      {reviewData.annotationDeleteError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {reviewData.annotationDeleteError}
        </div>
      ) : null}

      {reviewData.noteSaveError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {reviewData.noteSaveError}
        </div>
      ) : null}

      {reviewData.noteTranslationError ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {reviewData.noteTranslationError}
        </div>
      ) : null}
    </div>
  );
}
