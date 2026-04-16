import { createReadStream } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const ANNOTATIONS_TABLE = 'video_annotations';
const TIMESTAMPED_NOTES_TABLE = 'timestamped_notes';

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
