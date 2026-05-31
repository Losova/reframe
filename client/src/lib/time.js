export function formatTimestampMs(timestampMs) {
  const wholeSeconds = Math.floor(timestampMs / 1000);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  const centiseconds = Math.floor((timestampMs % 1000) / 10);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(centiseconds).padStart(2, '0')}`;
}

export function formatTimestampBadge(timestampSeconds) {
  const totalSeconds = Math.max(0, Math.floor(timestampSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function sortAnnotations(annotations) {
  return [...annotations].sort((left, right) => {
    if (left.timestampMs !== right.timestampMs) {
      return left.timestampMs - right.timestampMs;
    }

    return (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
  });
}

export function mergeAnnotations(...collections) {
  const records = new Map();

  collections.flat().forEach((annotation) => {
    records.set(annotation.id, annotation);
  });

  return sortAnnotations([...records.values()]);
}

export function sortNotes(notes) {
  return [...notes].sort((left, right) => {
    if (left.timestampSeconds !== right.timestampSeconds) {
      return left.timestampSeconds - right.timestampSeconds;
    }

    return (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
  });
}

export function mergeNotes(...collections) {
  const records = new Map();

  collections.flat().forEach((note) => {
    records.set(note.id, note);
  });

  return sortNotes([...records.values()]);
}
