import { useEffect, useEffectEvent, useRef, useState } from 'react';
import * as fabric from 'fabric';

const DRAW_COLOR = '#67e8f9';
const DRAW_STROKE_WIDTH = 4;
const MIN_CIRCLE_RADIUS = 12;
const MIN_ARROW_LENGTH = 18;

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

export function useAnnotationCanvas({
  annotationBucketMs,
  annotations,
  onPersistAnnotation
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const [isPaused, setIsPaused] = useState(true);
  const [activeTool, setActiveTool] = useState('none');
  const [currentBucket, setCurrentBucket] = useState(0);
  const [currentTimestampMs, setCurrentTimestampMs] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvasError, setCanvasError] = useState('');

  const annotationsAtCurrentTimestamp = annotations.filter(
    (annotation) => annotation.timestampBucket === currentBucket
  );

  const persistAnnotation = useEffectEvent(async (object, annotationType, canvas) => {
    const timestampMs = Math.max(
      0,
      Math.round((videoRef.current?.currentTime ?? 0) * 1000)
    );

    try {
      await onPersistAnnotation({
        annotationType,
        canvasHeight: Math.round(canvas.getHeight()),
        canvasWidth: Math.round(canvas.getWidth()),
        payload: serializeAnnotationObject(object),
        timestampMs
      });
    } catch {
      canvas.remove(object);
      canvas.requestRenderAll();
    }
  });

  const syncTimeFromVideo = useEffectEvent(() => {
    const nextTimestampMs = Math.max(
      0,
      Math.round((videoRef.current?.currentTime ?? 0) * 1000)
    );

    setCurrentTimestampMs(nextTimestampMs);
    setCurrentBucket(Math.round(nextTimestampMs / annotationBucketMs));
  });

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

    setCanvasError('');
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
        if (!cancelled) {
          setCanvasError('Unable to render the saved annotations on this frame.');
        }
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

    function handlePathCreated(event) {
      if (!isPaused || activeTool !== 'pen' || !event.path) {
        return;
      }

      applyObjectDefaults(event.path);
      canvas.requestRenderAll();
      void persistAnnotation(event.path, 'pen', canvas);
    }

    canvas.on('path:created', handlePathCreated);

    return () => {
      canvas.off('path:created', handlePathCreated);
    };
  }, [activeTool, isPaused, persistAnnotation]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas || !isPaused || !['circle', 'arrow'].includes(activeTool)) {
      return undefined;
    }

    let startPoint = null;
    let draftObject = null;

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

      if (activeTool === 'circle' && (draftObject.radius ?? 0) < MIN_CIRCLE_RADIUS) {
        canvas.remove(draftObject);
        canvas.requestRenderAll();
        resetDraft();
        return;
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

      void persistAnnotation(draftObject, activeTool, canvas);
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
  }, [activeTool, isPaused, persistAnnotation]);

  useEffect(() => {
    if (isPaused) {
      return undefined;
    }

    let animationFrameId = 0;

    function syncCurrentTime() {
      syncTimeFromVideo();
      animationFrameId = window.requestAnimationFrame(syncCurrentTime);
    }

    syncCurrentTime();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isPaused, syncTimeFromVideo]);

  function seekVideo(timestampSeconds) {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = Math.max(0, timestampSeconds);
    syncTimeFromVideo();
  }

  return {
    activeTool,
    annotationsAtCurrentTimestampCount: annotationsAtCurrentTimestamp.length,
    canvasContainerRef,
    canvasError,
    canvasRef,
    currentBucket,
    currentTimestampMs,
    isPaused,
    seekVideo,
    setActiveTool,
    setIsPaused,
    syncTimeFromVideo,
    videoRef
  };
}
