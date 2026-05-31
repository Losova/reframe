import { createReadStream } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const PROJECTS_TABLE = 'translate_projects';
const ANNOTATIONS_TABLE = 'video_annotations';
const TIMESTAMPED_NOTES_TABLE = 'timestamped_notes';
const CORE_PROJECT_SELECT_COLUMNS = [
  'id',
  'share_id',
  'owner_token',
  'title',
  'original_filename',
  'playback_path',
  'created_at'
].join(', ');
const PROJECT_SELECT_COLUMNS = [
  'id',
  'share_id',
  'owner_token',
  'title',
  'original_filename',
  'playback_path',
  'workspace_id',
  'client_name',
  'client_email',
  'brand_name',
  'brand_accent',
  'status',
  'version_label',
  'due_at',
  'download_enabled',
  'link_expires_at',
  'created_at'
].join(', ');

export const adminSupabase = createClient(
  config.supabaseUrl,
  config.supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

let bucketReadyPromise;

function createServiceSetupError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function formatProjectSchemaError(action, error) {
  return createServiceSetupError(
    `Unable to ${action} because the Supabase table "${PROJECTS_TABLE}" is missing required columns. Run the SQL in supabase/translate_projects.sql to apply the latest schema. Original Supabase error: ${error.message}`
  );
}

function formatProjectError(action, error) {
  if (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /relation .*translate_projects.* does not exist/i.test(error?.message ?? '') ||
    /could not find the table .*translate_projects/i.test(error?.message ?? '')
  ) {
    return createServiceSetupError(
      `Unable to ${action} because the Supabase table "${PROJECTS_TABLE}" is missing. Run the SQL in supabase/translate_projects.sql and try again.`
    );
  }

  if (isMissingProjectMetadataColumn(error)) {
    return formatProjectSchemaError(action, error);
  }

  return new Error(`Unable to ${action}: ${error.message}`);
}

function isMissingProjectMetadataColumn(error) {
  const message = error?.message ?? '';

  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    /schema cache/i.test(message) ||
    /column .* does not exist/i.test(message) ||
    /could not find .* column/i.test(message)
  );
}

function formatAnnotationError(action, error) {
  if (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /video_annotations/i.test(error?.message ?? '')
  ) {
    return new Error(
      `Unable to ${action} because the Supabase table "${ANNOTATIONS_TABLE}" is missing. Run the SQL in supabase/video_annotations.sql and try again.`
    );
  }

  return new Error(`Unable to ${action}: ${error.message}`);
}

function formatTimestampedNotesError(action, error) {
  if (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /timestamped_notes/i.test(error?.message ?? '')
  ) {
    return new Error(
      `Unable to ${action} because the Supabase table "${TIMESTAMPED_NOTES_TABLE}" is missing. Run the SQL in supabase/timestamped_notes.sql and try again.`
    );
  }

  return new Error(`Unable to ${action}: ${error.message}`);
}

function mapProjectRecord(record, { includeOwnerToken = false } = {}) {
  const project = {
    createdAt: record.created_at,
    id: record.id,
    originalFilename: record.original_filename,
    playbackPath: record.playback_path,
    workspaceId: record.workspace_id ?? null,
    clientName: record.client_name ?? null,
    clientEmail: record.client_email ?? null,
    brandName: record.brand_name ?? null,
    brandAccent: record.brand_accent ?? '#d6a15f',
    status: record.status ?? 'in_review',
    versionLabel: record.version_label ?? 'Version 1',
    dueAt: record.due_at ?? null,
    downloadEnabled: Boolean(record.download_enabled ?? false),
    linkExpiresAt: record.link_expires_at ?? null,
    shareId: record.share_id,
    title: record.title
  };

  if (includeOwnerToken) {
    project.ownerToken = record.owner_token;
  }

  return project;
}

function mapAnnotationRecord(record) {
  return {
    id: record.id,
    shareId: record.share_id,
    sessionId: record.session_id,
    timestampMs: record.timestamp_ms,
    timestampBucket: record.timestamp_bucket,
    annotationType: record.annotation_type,
    canvasWidth: record.canvas_width,
    canvasHeight: record.canvas_height,
    payload: record.payload,
    createdAt: record.created_at
  };
}

function mapTimestampedNoteRecord(record) {
  return {
    aiTranslation: record.ai_translation,
    createdAt: record.created_at,
    id: record.id,
    noteText: record.note_text,
    sessionId: record.session_id,
    shareId: record.share_id,
    timestampSeconds: Number(record.timestamp_seconds)
  };
}

export function buildVideoPath(shareId) {
  return `videos/${shareId}.mp4`;
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
  const projectCoreFields = {
    owner_token: ownerToken,
    original_filename: originalFilename,
    playback_path: playbackPath,
    share_id: shareId,
    title
  };
  const projectMetadataFields = {
    brand_accent: brandAccent,
    brand_name: brandName,
    client_email: clientEmail,
    client_name: clientName,
    due_at: dueAt,
    status,
    version_label: versionLabel,
    workspace_id: workspaceId
  };

  const { data, error } = await adminSupabase
    .from(PROJECTS_TABLE)
    .insert({
      ...projectCoreFields,
      ...projectMetadataFields
    })
    .select(PROJECT_SELECT_COLUMNS)
    .single();

  if (error) {
    if (isMissingProjectMetadataColumn(error)) {
      const { data: fallbackData, error: fallbackError } = await adminSupabase
        .from(PROJECTS_TABLE)
        .insert(projectCoreFields)
        .select(CORE_PROJECT_SELECT_COLUMNS)
        .single();

      if (fallbackError) {
        throw formatProjectError('create the project record', fallbackError);
      }

      return mapProjectRecord(fallbackData, { includeOwnerToken: true });
    }

    throw formatProjectError('create the project record', error);
  }

  return mapProjectRecord(data, { includeOwnerToken: true });
}

export async function getProjectByShareId(shareId) {
  return getProjectByShareIdInternal(shareId);
}

export async function getProjectWithOwnerTokenByShareId(shareId) {
  return getProjectByShareIdInternal(shareId, { includeOwnerToken: true });
}

async function getProjectByShareIdInternal(
  shareId,
  { includeOwnerToken = false } = {}
) {
  const { data, error } = await adminSupabase
    .from(PROJECTS_TABLE)
    .select(PROJECT_SELECT_COLUMNS)
    .eq('share_id', shareId)
    .maybeSingle();

  if (error) {
    if (isMissingProjectMetadataColumn(error)) {
      const { data: fallbackData, error: fallbackError } = await adminSupabase
        .from(PROJECTS_TABLE)
        .select(CORE_PROJECT_SELECT_COLUMNS)
        .eq('share_id', shareId)
        .maybeSingle();

      if (fallbackError) {
        throw formatProjectError('load the project', fallbackError);
      }

      if (!fallbackData) {
        return null;
      }

      return mapProjectRecord(fallbackData, { includeOwnerToken });
    }

    throw formatProjectError('load the project', error);
  }

  if (!data) {
    return null;
  }

  return mapProjectRecord(data, { includeOwnerToken });
}

export async function ensureBucket() {
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      const { data: buckets, error } = await adminSupabase.storage.listBuckets();

      if (error) {
        throw new Error(`Unable to list storage buckets: ${error.message}`);
      }

      const bucketExists = buckets.some(
        (bucket) => bucket.name === config.bucketName
      );

      if (bucketExists) {
        return;
      }

      const { error: createError } = await adminSupabase.storage.createBucket(
        config.bucketName,
        {
          public: true,
          allowedMimeTypes: ['video/mp4'],
          fileSizeLimit: 524_288_000
        }
      );

      if (createError) {
        throw new Error(`Unable to create storage bucket: ${createError.message}`);
      }
    })();
  }

  try {
    await bucketReadyPromise;
  } catch (error) {
    bucketReadyPromise = undefined;
    throw error;
  }
}

export async function uploadVideoToStorage(shareId, filePath) {
  await ensureBucket();

  const storagePath = buildVideoPath(shareId);
  const fileStream = createReadStream(filePath);
  const { error } = await adminSupabase.storage
    .from(config.bucketName)
    .upload(storagePath, fileStream, {
      contentType: 'video/mp4',
      upsert: false,
      cacheControl: '3600'
    });

  if (error) {
    throw new Error(`Unable to upload video: ${error.message}`);
  }

  return storagePath;
}

export async function deleteStoredVideo(shareId) {
  await ensureBucket();

  const { error } = await adminSupabase
    .storage
    .from(config.bucketName)
    .remove([buildVideoPath(shareId)]);

  if (error) {
    throw new Error(`Unable to delete the uploaded video: ${error.message}`);
  }
}

export async function getStoredVideo(shareId) {
  await ensureBucket();

  const expectedName = `${shareId}.mp4`;
  const { data, error } = await adminSupabase.storage
    .from(config.bucketName)
    .list('videos', {
      limit: 1,
      search: expectedName
    });

  if (error) {
    throw new Error(`Unable to fetch video metadata: ${error.message}`);
  }

  const match = data?.find((item) => item.name === expectedName);

  if (!match) {
    return null;
  }

  return {
    shareId,
    playbackPath: buildVideoPath(shareId)
  };
}

export async function listVideoAnnotations(shareId) {
  const { data, error } = await adminSupabase
    .from(ANNOTATIONS_TABLE)
    .select(
      'id, share_id, session_id, timestamp_ms, timestamp_bucket, annotation_type, canvas_width, canvas_height, payload, created_at'
    )
    .eq('share_id', shareId)
    .order('timestamp_ms', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw formatAnnotationError('load annotations', error);
  }

  return (data ?? []).map(mapAnnotationRecord);
}

export async function createVideoAnnotation({
  shareId,
  sessionId,
  timestampMs,
  annotationType,
  canvasWidth,
  canvasHeight,
  payload
}) {
  const timestampBucket = Math.round(timestampMs / config.annotationBucketMs);
  const { data, error } = await adminSupabase
    .from(ANNOTATIONS_TABLE)
    .insert({
      share_id: shareId,
      session_id: sessionId,
      timestamp_ms: timestampMs,
      timestamp_bucket: timestampBucket,
      annotation_type: annotationType,
      canvas_width: canvasWidth,
      canvas_height: canvasHeight,
      payload
    })
    .select(
      'id, share_id, session_id, timestamp_ms, timestamp_bucket, annotation_type, canvas_width, canvas_height, payload, created_at'
    )
    .single();

  if (error) {
    throw formatAnnotationError('save the annotation', error);
  }

  return mapAnnotationRecord(data);
}

export async function deleteVideoAnnotation({ annotationId, shareId }) {
  const { data, error } = await adminSupabase
    .from(ANNOTATIONS_TABLE)
    .delete()
    .eq('id', annotationId)
    .eq('share_id', shareId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw formatAnnotationError('delete the annotation', error);
  }

  return Boolean(data);
}

export async function updateProjectStatus({ shareId, status }) {
  const { data, error } = await adminSupabase
    .from(PROJECTS_TABLE)
    .update({ status })
    .eq('share_id', shareId)
    .select(PROJECT_SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingProjectMetadataColumn(error)) {
      if (/status/i.test(error?.message ?? '')) {
        throw formatProjectSchemaError('update the project status', error);
      }

      const { data: fallbackData, error: fallbackError } = await adminSupabase
        .from(PROJECTS_TABLE)
        .update({ status })
        .eq('share_id', shareId)
        .select(CORE_PROJECT_SELECT_COLUMNS)
        .maybeSingle();

      if (fallbackError) {
        throw formatProjectError('update the project status', fallbackError);
      }

      if (!fallbackData) {
        return null;
      }

      return mapProjectRecord({
        ...fallbackData,
        status
      });
    }

    throw formatProjectError('update the project status', error);
  }

  if (!data) {
    return null;
  }

  return mapProjectRecord(data);
}

export async function listTimestampedNotes(shareId) {
  const { data, error } = await adminSupabase
    .from(TIMESTAMPED_NOTES_TABLE)
    .select(
      'id, share_id, session_id, timestamp_seconds, note_text, ai_translation, created_at'
    )
    .eq('share_id', shareId)
    .order('timestamp_seconds', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw formatTimestampedNotesError('load notes', error);
  }

  return (data ?? []).map(mapTimestampedNoteRecord);
}

export async function createTimestampedNote({
  noteText,
  sessionId,
  shareId,
  timestampSeconds
}) {
  const { data, error } = await adminSupabase
    .from(TIMESTAMPED_NOTES_TABLE)
    .insert({
      note_text: noteText,
      session_id: sessionId,
      share_id: shareId,
      timestamp_seconds: timestampSeconds
    })
    .select(
      'id, share_id, session_id, timestamp_seconds, note_text, ai_translation, created_at'
    )
    .single();

  if (error) {
    throw formatTimestampedNotesError('save the note', error);
  }

  return mapTimestampedNoteRecord(data);
}

export async function updateTimestampedNoteTranslation({
  aiTranslation,
  noteId,
  shareId
}) {
  const { data, error } = await adminSupabase
    .from(TIMESTAMPED_NOTES_TABLE)
    .update({
      ai_translation: aiTranslation
    })
    .eq('id', noteId)
    .eq('share_id', shareId)
    .select(
      'id, share_id, session_id, timestamp_seconds, note_text, ai_translation, created_at'
    )
    .maybeSingle();

  if (error) {
    throw formatTimestampedNotesError('save the AI translation', error);
  }

  if (!data) {
    return null;
  }

  return mapTimestampedNoteRecord(data);
}
