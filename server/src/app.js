import crypto from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { isValidAiTranslation, translateNoteWithOpenAI } from './openai.js';
import {
  constructStripeWebhookEvent,
  createSubscriptionCheckoutSession,
  isStripeConfigured
} from './stripe.js';
import {
  createProject,
  createTimestampedNote,
  createVideoAnnotation,
  deleteVideoAnnotation,
  deleteStoredVideo,
  getProjectByShareId,
  getProjectWithOwnerTokenByShareId,
  getStoredVideo,
  listTimestampedNotes,
  listVideoAnnotations,
  updateProjectStatus,
  updateTimestampedNoteTranslation,
  uploadVideoToStorage
} from './supabase.js';

const SUPPORTED_ANNOTATION_TYPES = new Set(['pen', 'circle', 'arrow']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTE_LENGTH = 2_000;
const MAX_PROJECT_TITLE_LENGTH = 120;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_WORKSPACE_NAME_LENGTH = 80;
const MAX_CLIENT_FIELD_LENGTH = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const PROJECT_STATUSES = new Set([
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'final_delivered'
]);

const defaultServices = {
  createProject,
  createTimestampedNote,
  createVideoAnnotation,
  deleteVideoAnnotation,
  deleteStoredVideo,
  getProjectByShareId,
  getProjectWithOwnerTokenByShareId,
  getStoredVideo,
  listTimestampedNotes,
  listVideoAnnotations,
  updateProjectStatus,
  updateTimestampedNoteTranslation,
  uploadVideoToStorage
};

export function buildShareUrl(request, shareId) {
  const forwardedProtocol = request.get('x-forwarded-proto');
  const forwardedHost = request.get('x-forwarded-host');
  const protocol = forwardedProtocol ?? request.protocol;
  const host = forwardedHost ?? request.get('host');
  return `${protocol}://${host}/v/${shareId}`;
}

export function buildOwnerUrl(request, shareId, ownerToken) {
  const forwardedProtocol = request.get('x-forwarded-proto');
  const forwardedHost = request.get('x-forwarded-host');
  const protocol = forwardedProtocol ?? request.protocol;
  const host = forwardedHost ?? request.get('host');
  return `${protocol}://${host}/o/${shareId}/${ownerToken}`;
}

export function buildPlaybackUrl(playbackPath, runtimeConfig = config) {
  const encodedPlaybackPath = String(playbackPath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${runtimeConfig.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(
    runtimeConfig.bucketName
  )}/${encodedPlaybackPath}`;
}

export function buildProjectResponse(project, request, runtimeConfig = config) {
  const { ownerToken, ...safeProject } = project;

  return {
    ...safeProject,
    playbackUrl: buildPlaybackUrl(project.playbackPath, runtimeConfig),
    shareUrl: buildShareUrl(request, project.shareId)
  };
}

export function deriveProjectTitle(filename) {
  const baseName = path.parse(filename ?? '').name;
  const normalized = baseName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || 'Untitled Review';
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isValidSessionId(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_SESSION_ID_LENGTH
  );
}

function isValidUUID(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

export function normalizeProjectTitle(value, fallbackTitle = 'Untitled Review') {
  if (typeof value !== 'string') {
    return fallbackTitle;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return fallbackTitle;
  }

  return normalized.slice(0, MAX_PROJECT_TITLE_LENGTH);
}

function normalizeOptionalText(value, maxLength = MAX_CLIENT_FIELD_LENGTH) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeOptionalEmail(value) {
  const normalized = normalizeOptionalText(value, MAX_CLIENT_FIELD_LENGTH);

  if (!normalized) {
    return null;
  }

  return isValidEmail(normalized) ? normalized : null;
}

function normalizeBrandAccent(value) {
  if (typeof value !== 'string') {
    return '#d6a15f';
  }

  const normalized = value.trim();

  return HEX_COLOR_RE.test(normalized) ? normalized : '#d6a15f';
}

function normalizeProjectStatus(value) {
  return PROJECT_STATUSES.has(value) ? value : 'in_review';
}

function requireValidShareId(request, response, next) {
  if (!isValidUUID(request.params.shareId)) {
    return response.status(400).json({ message: 'Invalid share ID format.' });
  }

  next();
}

function getOwnerTokenFromRequest(request) {
  const headerValue = request.get('x-owner-token');

  if (typeof headerValue !== 'string' || headerValue.trim().length === 0) {
    return '';
  }

  return headerValue.trim();
}

export function createApp({
  runtimeConfig = config,
  services: providedServices = {}
} = {}) {
  const services = {
    ...defaultServices,
    ...providedServices
  };

  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false
    })
  );

  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGIN
        ? [process.env.ALLOWED_ORIGIN]
        : []
      : ['http://localhost:5173', 'http://localhost:3001'];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-Owner-Token']
    })
  );

  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
    (request, response, next) => {
      const signature = request.get('stripe-signature');

      if (!signature) {
        response.status(400).json({ message: 'Missing Stripe signature.' });
        return;
      }

      try {
        const event = constructStripeWebhookEvent({
          body: request.body,
          runtimeConfig,
          signature
        });

        // The SaaS schema stores Stripe IDs. Wire workspace entitlement updates here
        // once authentication is connected and customer IDs are attached to users.
        response.json({ received: true, type: event.type });
      } catch (error) {
        next(error);
      }
    }
  );

  app.use(express.json({ limit: '64kb' }));

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down.' }
  });

  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Upload limit reached. Try again in an hour.' }
  });

  const translateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'AI translation limit reached. Try again in an hour.' }
  });

  const billingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many billing attempts. Please slow down.' }
  });

  app.use(generalLimiter);

  const storage = multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, runtimeConfig.uploadDirectory);
    },
    filename: (_request, _file, callback) => {
      callback(null, `${Date.now()}-${crypto.randomUUID()}.mp4`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 524_288_000 },
    fileFilter: (_request, file, callback) => {
      const ext = path.extname(file.originalname).toLowerCase();

      if (file.mimetype !== 'video/mp4' || ext !== '.mp4') {
        callback(new Error('Only .mp4 files are accepted.'));
        return;
      }

      callback(null, true);
    }
  });

  app.get('/api/config', (_request, response) => {
    response.json({
      annotationBucketMs: runtimeConfig.annotationBucketMs,
      appName: 'Reframe',
      billingConfigured: isStripeConfigured(runtimeConfig),
      monthlyPriceUsd: runtimeConfig.monthlyPriceUsd,
      openAiConfigured: Boolean(runtimeConfig.openaiApiKey)
    });
  });

  app.post('/api/billing/checkout', billingLimiter, async (request, response, next) => {
    const { email, workspaceName } = request.body ?? {};

    if (!isValidEmail(email)) {
      return response.status(400).json({ message: 'A valid email is required.' });
    }

    if (typeof workspaceName !== 'string' || workspaceName.trim().length === 0) {
      return response.status(400).json({ message: 'Workspace name is required.' });
    }

    if (workspaceName.trim().length > MAX_WORKSPACE_NAME_LENGTH) {
      return response
        .status(400)
        .json({ message: `Workspace names cannot exceed ${MAX_WORKSPACE_NAME_LENGTH} characters.` });
    }

    if (!isStripeConfigured(runtimeConfig)) {
      return response
        .status(503)
        .json({ message: 'Stripe billing is not configured yet.' });
    }

    try {
      const session = await createSubscriptionCheckoutSession({
        email,
        runtimeConfig,
        workspaceName
      });

      response.status(201).json({
        checkoutUrl: session.url
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:shareId', requireValidShareId, async (request, response, next) => {
    try {
      const ownerToken = getOwnerTokenFromRequest(request);
      const project = ownerToken
        ? await services.getProjectWithOwnerTokenByShareId(request.params.shareId)
        : await services.getProjectByShareId(request.params.shareId);

      if (project) {
        response.json({
          project: {
            ...buildProjectResponse(project, request, runtimeConfig),
            isOwner: Boolean(ownerToken && ownerToken === project.ownerToken)
          }
        });
        return;
      }

      const legacyVideo = await services.getStoredVideo(request.params.shareId);

      if (!legacyVideo) {
        response.status(404).json({ message: 'Project not found.' });
        return;
      }

      response.json({
        project: buildProjectResponse(
          {
            createdAt: null,
            id: null,
            isLegacy: true,
            originalFilename: null,
            playbackPath: legacyVideo.playbackPath,
            shareId: legacyVideo.shareId,
            title: 'Untitled Review'
          },
          request,
          runtimeConfig
        )
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    '/api/projects/:shareId/status',
    requireValidShareId,
    async (request, response, next) => {
      const { status } = request.body ?? {};

      if (!PROJECT_STATUSES.has(status) || status === 'draft') {
        return response.status(400).json({ message: 'Unsupported project status.' });
      }

      try {
        if (status === 'final_delivered') {
          const ownerToken = getOwnerTokenFromRequest(request);
          const ownerProject = await services.getProjectWithOwnerTokenByShareId(
            request.params.shareId
          );

          if (!ownerProject || ownerProject.ownerToken !== ownerToken) {
            return response
              .status(403)
              .json({ message: 'Only the animator owner can mark final delivery.' });
          }
        }

        const project = await services.updateProjectStatus({
          shareId: request.params.shareId,
          status
        });

        if (!project) {
          response.status(404).json({ message: 'Project not found.' });
          return;
        }

        response.json({
          project: buildProjectResponse(project, request, runtimeConfig)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  async function requireOwnerProject(request, response, next) {
    const ownerToken = getOwnerTokenFromRequest(request);

    if (!ownerToken) {
      response.status(401).json({ message: 'Animator owner token is required.' });
      return;
    }

    try {
      const project = await services.getProjectWithOwnerTokenByShareId(
        request.params.shareId
      );

      if (!project) {
        response.status(404).json({ message: 'Project not found.' });
        return;
      }

      if (project.ownerToken !== ownerToken) {
        response.status(403).json({ message: 'Owner token does not match this project.' });
        return;
      }

      request.project = project;
      next();
    } catch (error) {
      next(error);
    }
  }

  app.get('/api/videos/:shareId', requireValidShareId, async (request, response, next) => {
    try {
      const project = await services.getProjectByShareId(request.params.shareId);

      if (project) {
        response.json(buildProjectResponse(project, request, runtimeConfig));
        return;
      }

      const legacyVideo = await services.getStoredVideo(request.params.shareId);

      if (!legacyVideo) {
        response.status(404).json({ message: 'Video not found.' });
        return;
      }

      response.json(
        buildProjectResponse(
          {
            createdAt: null,
            id: null,
            isLegacy: true,
            originalFilename: null,
            playbackPath: legacyVideo.playbackPath,
            shareId: legacyVideo.shareId,
            title: 'Untitled Review'
          },
          request,
          runtimeConfig
        )
      );
    } catch (error) {
      next(error);
    }
  });

  app.get(
    '/api/videos/:shareId/annotations',
    requireValidShareId,
    async (request, response, next) => {
      try {
        const annotations = await services.listVideoAnnotations(request.params.shareId);
        response.json({ annotations });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    '/api/videos/:shareId/annotations',
    requireValidShareId,
    async (request, response, next) => {
      const {
        sessionId,
        timestampMs,
        annotationType,
        canvasWidth,
        canvasHeight,
        payload
      } = request.body ?? {};

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
        return response
          .status(400)
          .json({ message: 'Canvas dimensions must be positive integers.' });
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return response.status(400).json({ message: 'A valid annotation payload is required.' });
      }

      if (JSON.stringify(payload).length > 32_000) {
        return response.status(400).json({ message: 'Annotation payload is too large.' });
      }

      try {
        const annotation = await services.createVideoAnnotation({
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
    }
  );

  app.delete(
    '/api/videos/:shareId/annotations/:annotationId',
    requireValidShareId,
    requireOwnerProject,
    async (request, response, next) => {
      if (!isValidUUID(request.params.annotationId)) {
        return response.status(400).json({ message: 'Invalid annotation ID format.' });
      }

      try {
        const deleted = await services.deleteVideoAnnotation({
          annotationId: request.params.annotationId,
          shareId: request.params.shareId
        });

        if (!deleted) {
          response.status(404).json({ message: 'Annotation not found.' });
          return;
        }

        response.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );

  app.get('/api/videos/:shareId/notes', requireValidShareId, async (request, response, next) => {
    try {
      const notes = await services.listTimestampedNotes(request.params.shareId);
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
      return response
        .status(400)
        .json({ message: `Notes cannot exceed ${MAX_NOTE_LENGTH} characters.` });
    }

    if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
      return response.status(400).json({ message: 'A valid video timestamp is required.' });
    }

    try {
      const note = await services.createTimestampedNote({
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
    requireOwnerProject,
    async (request, response, next) => {
      if (!isValidUUID(request.params.noteId)) {
        return response.status(400).json({ message: 'Invalid note ID format.' });
      }

      const { aiTranslation } = request.body ?? {};

      if (!isValidAiTranslation(aiTranslation)) {
        return response
          .status(400)
          .json({ message: 'A valid AI translation payload is required.' });
      }

      try {
        const note = await services.updateTimestampedNoteTranslation({
          aiTranslation,
          noteId: request.params.noteId,
          shareId: request.params.shareId
        });

        if (!note) {
          response.status(404).json({ message: 'Note not found.' });
          return;
        }

        response.json(note);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    '/api/videos/:shareId/notes/:noteId/translation',
    translateLimiter,
    requireValidShareId,
    requireOwnerProject,
    async (request, response, next) => {
      if (!isValidUUID(request.params.noteId)) {
        return response.status(400).json({ message: 'Invalid note ID format.' });
      }

      const { noteText } = request.body ?? {};

      if (typeof noteText !== 'string' || noteText.trim().length === 0) {
        return response.status(400).json({ message: 'noteText is required.' });
      }

      if (noteText.trim().length > MAX_NOTE_LENGTH) {
        return response.status(400).json({ message: 'Note is too long to translate.' });
      }

      if (!runtimeConfig.openaiApiKey) {
        return response
          .status(503)
          .json({ message: 'AI translation is not configured.' });
      }

      try {
        const aiTranslation = await translateNoteWithOpenAI({
          apiKey: runtimeConfig.openaiApiKey,
          noteText
        });
        const note = await services.updateTimestampedNoteTranslation({
          aiTranslation,
          noteId: request.params.noteId,
          shareId: request.params.shareId
        });

        if (!note) {
          response.status(404).json({ message: 'Note not found.' });
          return;
        }

        response.json(note);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post('/api/uploads', uploadLimiter, upload.single('video'), async (request, response, next) => {
    if (!request.file) {
      return response.status(400).json({ message: 'Attach an MP4 file before uploading.' });
    }

    const shareId = crypto.randomUUID();
    const ownerToken = crypto.randomUUID();
    const title = normalizeProjectTitle(
      request.body?.title,
      deriveProjectTitle(request.file.originalname)
    );
    const brandAccent = normalizeBrandAccent(request.body?.brandAccent);
    const brandName = normalizeOptionalText(request.body?.brandName);
    const clientEmail = normalizeOptionalEmail(request.body?.clientEmail);
    const clientName = normalizeOptionalText(request.body?.clientName);
    const dueAt =
      typeof request.body?.dueAt === 'string' && request.body.dueAt.trim()
        ? new Date(request.body.dueAt)
        : null;
    const normalizedDueAt =
      dueAt instanceof Date && Number.isFinite(dueAt.getTime())
        ? dueAt.toISOString()
        : null;
    const status = normalizeProjectStatus(request.body?.status);
    const versionLabel =
      normalizeOptionalText(request.body?.versionLabel, 40) ?? 'Version 1';

    try {
      const playbackPath = await services.uploadVideoToStorage(shareId, request.file.path);
      const project = await services.createProject({
        brandAccent,
        brandName,
        clientEmail,
        clientName,
        dueAt: normalizedDueAt,
        ownerToken,
        originalFilename: request.file.originalname,
        playbackPath,
        shareId,
        status,
        title,
        versionLabel
      });

      response.status(201).json({
        ownerToken,
        ownerUrl: buildOwnerUrl(request, shareId, ownerToken),
        project: buildProjectResponse(project, request, runtimeConfig),
        shareId,
        shareUrl: buildShareUrl(request, shareId)
      });
    } catch (error) {
      try {
        await services.deleteStoredVideo(shareId);
      } catch {
        // Best effort cleanup only.
      }

      next(error);
    } finally {
      await unlink(request.file.path).catch(() => {});
    }
  });

  app.use((error, _request, response, _next) => {
    const statusCode =
      error instanceof multer.MulterError
        ? 400
        : Number.isInteger(error.statusCode)
          ? error.statusCode
        : response.statusCode >= 400
          ? response.statusCode
          : 500;

    if (statusCode >= 500) {
      console.error(error);
    }

    const message =
      statusCode < 500 || error.statusCode
        ? error.message || 'Bad request.'
        : 'An internal error occurred.';

    response.status(statusCode).json({ message });
  });

  return app;
}
