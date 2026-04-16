async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

export async function fetchAppConfig() {
  return parseResponse(await fetch('/api/config'));
}

export async function uploadVideo(file) {
  const formData = new FormData();
  formData.append('video', file);

  return parseResponse(
    await fetch('/api/uploads', {
      method: 'POST',
      body: formData
    })
  );
}

export async function fetchVideo(shareId) {
  return parseResponse(await fetch(`/api/videos/${shareId}`));
}

export async function fetchAnnotations(shareId) {
  const payload = await parseResponse(
    await fetch(`/api/videos/${shareId}/annotations`)
  );

  return payload.annotations;
}

export async function saveAnnotation(shareId, annotation) {
  return parseResponse(
    await fetch(`/api/videos/${shareId}/annotations`, {
      body: JSON.stringify(annotation),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
  );
}

export async function fetchNotes(shareId) {
  const payload = await parseResponse(await fetch(`/api/videos/${shareId}/notes`));

  return payload.notes;
}

export async function saveNote(shareId, note) {
  return parseResponse(
    await fetch(`/api/videos/${shareId}/notes`, {
      body: JSON.stringify(note),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
  );
}

export async function saveNoteTranslation(shareId, noteId, aiTranslation) {
  return parseResponse(
    await fetch(`/api/videos/${shareId}/notes/${noteId}/translation`, {
      body: JSON.stringify({ aiTranslation }),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'PATCH'
    })
  );
}
