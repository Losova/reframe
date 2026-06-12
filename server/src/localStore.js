import crypto from 'node:crypto';
import { access, copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const DATABASE_FILENAME = 'reframe-local-data.json';

function getDatabasePath() {
  return path.join(config.localDataDirectory, DATABASE_FILENAME);
}

function getVideosDirectory() {
  return path.join(config.localDataDirectory, 'videos');
}

function createEmptyDatabase() {
  return {
    annotations: [],
    notes: [],
    projects: []
  };
}

async function ensureLocalDirectories() {
  await mkdir(getVideosDirectory(), { recursive: true });
}

async function readDatabase() {
  await ensureLocalDirectories();

  try {
    const raw = await readFile(getDatabasePath(), 'utf8');
    const parsed = JSON.parse(raw);

    return {
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createEmptyDatabase();
    }

    throw error;
  }
}

async function writeDatabase(database) {
  await ensureLocalDirectories();

  const databasePath = getDatabasePath();
  const temporaryPath = `${databasePath}.${crypto.randomUUID()}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, databasePath);
}

async function updateDatabase(mutator) {
  const database = await readDatabase();
  const result = mutator(database);
  await writeDatabase(database);
  return result;
}

function nowIso() {
  return new Date().toISOString();
}

function buildVideoPath(shareId) {
  return `videos/${shareId}.mp4`;
}

function sortByTimestampThenCreatedAt(left, right, timestampKey) {
  return (
    Number(left[timestampKey]) - Number(right[timestampKey]) ||
    String(left.createdAt).localeCompare(String(right.createdAt))
  );
}

export async function uploadVideoToStorage(shareId, filePath) {
  await ensureLocalDirectories();

  const playbackPath = buildVideoPath(shareId);
  await copyFile(filePath, path.join(config.localDataDirectory, playbackPath));

  return playbackPath;
}

export async function deleteStoredVideo(shareId) {
  await unlink(path.join(config.localDataDirectory, buildVideoPath(shareId))).catch(
    (error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  );
}

export async function getStoredVideo(shareId) {
  const playbackPath = buildVideoPath(shareId);

  try {
    await access(path.join(config.localDataDirectory, playbackPath));
  } catch {
    return null;
  }

  return {
    playbackPath,
    shareId
  };
}

export async function createProject({
  brandAccent,
  brandName,
  clientEmail,
  clientName,
  dueAt,
  ownerToken,
  originalFilename,
  playbackPath,
  shareId,
  status = 'in_review',
  title,
  versionLabel = 'Version 1',
  workspaceId = null
}) {
  return updateDatabase((database) => {
    const project = {
      brandAccent: brandAccent ?? '#d6a15f',
      brandName: brandName ?? null,
      clientEmail: clientEmail ?? null,
      clientName: clientName ?? null,
      createdAt: nowIso(),
      downloadEnabled: false,
      dueAt: dueAt ?? null,
      id: crypto.randomUUID(),
      linkExpiresAt: null,
      originalFilename,
      ownerToken,
      playbackPath,
      shareId,
      status,
      title,
      versionLabel,
      workspaceId
    };

    database.projects.push(project);
    return project;
  });
}

async function getProjectByShareIdInternal(shareId, { includeOwnerToken = false } = {}) {
  const database = await readDatabase();
  const project = database.projects.find((item) => item.shareId === shareId);

  if (!project) {
    return null;
  }

  if (includeOwnerToken) {
    return { ...project };
  }

  const { ownerToken, ...safeProject } = project;
  return safeProject;
}

export function getProjectByShareId(shareId) {
  return getProjectByShareIdInternal(shareId);
}

export function getProjectWithOwnerTokenByShareId(shareId) {
  return getProjectByShareIdInternal(shareId, { includeOwnerToken: true });
}

export async function updateProjectStatus({ shareId, status }) {
  return updateDatabase((database) => {
    const project = database.projects.find((item) => item.shareId === shareId);

    if (!project) {
      return null;
    }

    project.status = status;
    return { ...project };
  });
}

export async function listVideoAnnotations(shareId) {
  const database = await readDatabase();

  return database.annotations
    .filter((annotation) => annotation.shareId === shareId)
    .sort((left, right) => sortByTimestampThenCreatedAt(left, right, 'timestampMs'));
}

export async function createVideoAnnotation({
  annotationType,
  canvasHeight,
  canvasWidth,
  payload,
  sessionId,
  shareId,
  timestampMs
}) {
  return updateDatabase((database) => {
    const annotation = {
      annotationType,
      canvasHeight,
      canvasWidth,
      createdAt: nowIso(),
      id: crypto.randomUUID(),
      payload,
      sessionId,
      shareId,
      timestampBucket: Math.round(timestampMs / config.annotationBucketMs),
      timestampMs
    };

    database.annotations.push(annotation);
    return annotation;
  });
}

export async function deleteVideoAnnotation({ annotationId, shareId }) {
  return updateDatabase((database) => {
    const originalLength = database.annotations.length;
    database.annotations = database.annotations.filter(
      (annotation) =>
        !(annotation.id === annotationId && annotation.shareId === shareId)
    );

    return database.annotations.length !== originalLength;
  });
}

export async function listTimestampedNotes(shareId) {
  const database = await readDatabase();

  return database.notes
    .filter((note) => note.shareId === shareId)
    .sort((left, right) =>
      sortByTimestampThenCreatedAt(left, right, 'timestampSeconds')
    );
}

export async function createTimestampedNote({
  noteText,
  sessionId,
  shareId,
  timestampSeconds
}) {
  return updateDatabase((database) => {
    const note = {
      aiTranslation: null,
      createdAt: nowIso(),
      id: crypto.randomUUID(),
      noteText,
      sessionId,
      shareId,
      timestampSeconds
    };

    database.notes.push(note);
    return note;
  });
}

export async function updateTimestampedNoteTranslation({
  aiTranslation,
  noteId,
  shareId
}) {
  return updateDatabase((database) => {
    const note = database.notes.find(
      (item) => item.id === noteId && item.shareId === shareId
    );

    if (!note) {
      return null;
    }

    note.aiTranslation = aiTranslation;
    return { ...note };
  });
}
