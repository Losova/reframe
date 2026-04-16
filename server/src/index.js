import crypto from 'node:crypto';
import { access, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import {
  createTimestampedNote,
  createVideoAnnotation,
  getStoredVideo,
  listTimestampedNotes,
  listVideoAnnotations,
  updateTimestampedNoteTranslation,
  uploadVideoToStorage
} from './supabase.js';

// ── Constants ────────────────────────────────────────────────────────────────
const SUPPORTED_ANNOTATION_TYPES = new Set(['pen', 'circle', 'arrow']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTE_LENGTH = 2_000;
const MAX_SESSION_ID_LENGTH = 128;

// ── OpenAI translation config ────────────────────────────────────────────────
const TRANSLATION_SYSTEM_PROMPT =
  'You are a creative director helping animators understand client feedback. ' +
  'Convert this vague client note into a clear, actionable creative direction. ' +
  'Return a JSON object with: { summary: string (1 sentence clear direction), ' +
  'actions: string[] (2-4 bullet points of specific things to do), ' +
  'tone: string (one word: e.g. warmer, faster, bolder) }';

const TRANSLATION_SCHEMA = {
  additionalProperties: false,
  properties: {
    actions: { items: { type: 'string' }, type: 'array' },
    summary: { type: 'string' },
    tone: { type: 'string' }
  },
  required: ['summary', 'actions', 'tone'],
  type: 'object'
};

// ── App setup ────────────────────────────────────────────────────────────────
const app = express();

// Trust only the first proxy hop (set to false if not behind a proxy)
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow video playback from Supabase CDN
    contentSecurityPolicy: false // disabled so React can self-host without a nonce setup
  })
);

// CORS — only allow same-origin in production, localhost in dev
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : [])
  : ['http://localhost:5173', 'http://localhost:3001'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman in dev)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type']
  })
);

// Body limits
app.use(express.json({ limit: '64kb' }));

// ── Rate limiters ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Upload limit reached. Try again in an hour.' }
});

const translateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'AI translation limit reached. Try again in an hour.' }
});

app.use(generalLimiter);

// ── Multer (file uploads) ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, config.uploadDirectory);
  },
  filename: (_request, _file, callback) => {
    // Use a random name — never trust the original filename
    callback(null, `${Date.now()}-${crypto.randomUUID()}.mp4`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 524_288_000 },
  fileFilter: (_request, file, callback) => {
    // Check both MIME type and extension — MIME can be spoofed but extension adds a second check
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype !== 'video/mp4' || ext !== '.mp4') {
      callback(new Error('Only .mp4 files are accepted.'));
      return;
    }
    callback(null, true);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildShareUrl(request, shareId) {
  const forwardedProtocol = request.get('x-forwarded-proto');
  const forwardedHost = request.get('x-forwarded-host');
  const protocol = forwardedProtocol ?? request.protocol;
  const host = forwardedHost ?? request.get('host');
  return `${protocol}://${host}/v/${shareId}`;
}

function isValidUUID(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isValidAiTranslation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { actions, summary, tone } = value;
  return (
    typeof summary === 'string' && summary.trim().length > 0 &&
    Array.isArray(actions) &&
    actions.length >= 2 && actions.length <= 4 &&
    actions.every((a) => typeof a === 'string' && a.trim().length > 0) &&
    typeof tone === 'string' && tone.trim().length > 0
  );
}

function isValidSessionId(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_SESSION_ID_LENGTH
  );
}

// Middleware: validate :shareId path param is a UUID
function requireValidShareId(request, response, next) {
  if (!isValidUUID(request.params.shareId)) {
    return response.status(400).json({ message: 'Invalid share ID format.' });
  }
  next();
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Config — only exposes publishable (safe) keys, never the secret key
app.get('/api/config', (_request, response) => {
  response.json({
    annotationBucketMs: config.annotationBucketMs,
    bucketName: config.bucketName,
    supabasePublishableKey: config.supabasePublishableKey,
    supabaseUrl: config.supabaseUrl
  });
});

// AI translation — server-side only, key never leaves the server
app.post('/api/translate', translateLimiter, async (request, response, next) => {
  const { noteText } = request.body ?? {};
  if (typeof noteText !== 'string' || noteText.trim().length === 0) {
    return response.status(400).json({ message: 'noteText is required.' });
  }
  if (noteText.trim().length > MAX_NOTE_LENGTH) {
    return response.status(400).json({ message: 'Note is too long to translate.' });
  }
  if (!config.openaiApiKey) {
    return response.status(503).json({ message: 'AI translation is not configured.' });
  }
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        instructions: TRANSLATION_SYSTEM_PROMPT,
        input: [{ role: 'user', type: 'message', content: [{ type: 'input_text', text: noteText.trim() }] }],
        text: {
          format: {
            type: 'json_schema',
            name: 'creative_direction',
            strict: true,
            schema: TRANSLATION_SCHEMA
          }
        }
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error?.message || 'OpenAI request failed.');
    }
    // Extract text from response
    let outputText = payload.output_text ?? '';
    if (!outputText) {
      for (const out of payload.output ?? []) {
        for (const item of out.content ?? []) {
          if (typeof item.text === 'string' && item.text.trim()) {
            outputText = item.text;
            break;
          }
        }
        if (outputText) break;
      }
    }
    if (!outputText) throw new Error('Empty response from OpenAI.');
    const parsed = JSON.parse(outputText);
    if (!isValidAiTranslation(parsed)) throw new Error('Unexpected AI response shape.');
    response.json(parsed);
  } catch (error) {
    next(error);
  }
});

// Video lookup
app.get('/api/videos/:shareId', requireValidShareId, async (request, response, next) => {
  try {
    const storedVideo = await getStoredVideo(request.params.shareId);
    if (!storedVideo) {
      return response.status(404).json({ message: 'Video not found.' });
    }
    response.json({ ...storedVideo, shareUrl: buildShareUrl(request, request.params.shareId) });
  } catch (error) {
    next(error);
  }
});

// Annotations
app.get('/api/videos/:shareId/annotations', requireValidShareId, async (request, response, next) => {
  try {
    const annotations = await listVideoAnnotations(request.params.shareId);
    response.json({ annotations });
  } catch (error) {
    next(error);
  }
});

app.post('/api/videos/:shareId/annotations', requireValidShareId, async (request, response, next) => {
  const { sessionId, timestampMs, annotationType, canvasWidth, canvasHeight, payload } = request.body ?? {};

  if (!isValidSessionId(sessionId)) {
    return response.status(400).json({ message: 'A valid session ID is required.' });
  }
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    return response.status(400).json({ message: 'A valid video timestamp is required.' });
  }
  if (!SUPPORTED_ANNOTATION_TYPES.has(annotationType)) {
    return response.status(400).json({ message: 'Unsupported annotation type.' });
  }
  if (!isPositiveInteger(canvasWidth) || !isPositiveInteger(canvasHeight)) {
    return response.status(400).json({ message: 'Canvas dimensions must be positive integers.' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return response.status(400).json({ message: 'A valid annotation payload is required.' });
  }
  // Guard against absurdly large payloads (belt-and-suspenders on top of the 64kb body limit)
  if (JSON.stringify(payload).length > 32_000) {
    return response.status(400).json({ message: 'Annotation payload is too large.' });
  }

  try {
    const annotation = await createVideoAnnotation({
      shareId: request.params.shareId,
      sessionId: sessionId.trim(),
      timestampMs: Math.round(timestampMs),
      annotationType,
      canvasWidth,
      canvasHeight,
      payload
    });
    response.status(201).json(annotation);
  } catch (error) {
    next(error);
  }
});

// Notes
app.get('/api/videos/:shareId/notes', requireValidShareId, async (request, response, next) => {
  try {
    const notes = await listTimestampedNotes(request.params.shareId);
    response.json({ notes });
  } catch (error) {
    next(error);
  }
});

app.post('/api/videos/:shareId/notes', requireValidShareId, async (request, response, next) => {
  const { noteText, sessionId, timestampSeconds } = request.body ?? {};

  if (!isValidSessionId(sessionId)) {
    return response.status(400).json({ message: 'A valid session ID is required.' });
  }
  if (typeof noteText !== 'string' || noteText.trim().length === 0) {
    return response.status(400).json({ message: 'Note text is required.' });
  }
  if (noteText.trim().length > MAX_NOTE_LENGTH) {
    return response.status(400).json({ message: `Notes cannot exceed ${MAX_NOTE_LENGTH} characters.` });
  }
  if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
    return response.status(400).json({ message: 'A valid video timestamp is required.' });
  }

  try {
    const note = await createTimestampedNote({
      noteText: noteText.trim(),
      sessionId: sessionId.trim(),
      shareId: request.params.shareId,
      timestampSeconds: Number(timestampSeconds)
    });
    response.status(201).json(note);
  } catch (error) {
    next(error);
  }
});

app.patch(
  '/api/videos/:shareId/notes/:noteId/translation',
  requireValidShareId,
  async (request, response, next) => {
    if (!isValidUUID(request.params.noteId)) {
      return response.status(400).json({ message: 'Invalid note ID format.' });
    }
    const { aiTranslation } = request.body ?? {};
    if (!isValidAiTranslation(aiTranslation)) {
      return response.status(400).json({ message: 'A valid AI translation payload is required.' });
    }
    try {
      const note = await updateTimestampedNoteTranslation({
        aiTranslation,
        noteId: request.params.noteId,
        shareId: request.params.shareId
      });
      if (!note) {
        return response.status(404).json({ message: 'Note not found.' });
      }
      response.json(note);
    } catch (error) {
      next(error);
    }
  }
);

// Upload
app.post('/api/uploads', uploadLimiter, upload.single('video'), async (request, response, next) => {
  if (!request.file) {
    return response.status(400).json({ message: 'Attach an MP4 file before uploading.' });
  }
  const shareId = crypto.randomUUID();
  try {
    await uploadVideoToStorage(shareId, request.file.path);
    response.status(201).json({ shareId, shareUrl: buildShareUrl(request, shareId) });
  } catch (error) {
    next(error);
  } finally {
    await unlink(request.file.path).catch(() => {});
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((error, _request, response, _next) => {
  const statusCode =
    error instanceof multer.MulterError
      ? 400
      : response.statusCode >= 400
        ? response.statusCode
        : 500;

  // Never leak internal stack traces to the client
  const message =
    statusCode < 500
      ? error.message || 'Bad request.'
      : 'An internal error occurred.';

  response.status(statusCode).json({ message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function startServer() {
  await mkdir(config.uploadDirectory, { recursive: true });

  const builtIndexPath = path.join(config.clientDistDirectory, 'index.html');
  const hasBuiltClient = await access(builtIndexPath)
    .then(() => true)
    .catch(() => false);

  if (hasBuiltClient) {
    app.use(express.static(config.clientDistDirectory));
    app.get(/^\/(?!api).*/, (_request, response) => {
      response.sendFile(builtIndexPath);
    });
  }

  app.listen(config.port, () => {
    console.log(`Reframe server running on http://localhost:${config.port}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
