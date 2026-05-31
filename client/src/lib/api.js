async function parseResponse(response) {
  if (response.status === 204) {
    return {};
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

function buildOwnerHeaders(ownerToken) {
  if (!ownerToken) {
    return {};
  }

  return {
    'X-Owner-Token': ownerToken
  };
}

export async function fetchAppConfig() {
  return parseResponse(await fetch('/api/config'));
}

export async function uploadVideo({ file, title, ...metadata }) {
  const formData = new FormData();
  formData.append('video', file);
  formData.append('title', title);

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) {
      continue;
    }

    formData.append(key, value);
  }

  return parseResponse(
    await fetch('/api/uploads', {
      method: 'POST',
      body: formData
    })
  );
}

export async function createBillingCheckoutSession({ email, workspaceName }) {
  return parseResponse(
    await fetch('/api/billing/checkout', {
      body: JSON.stringify({ email, workspaceName }),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
  );
}

export async function fetchProject(shareId, { ownerToken = '' } = {}) {
  const payload = await parseResponse(
    await fetch(`/api/projects/${shareId}`, {
      headers: buildOwnerHeaders(ownerToken)
    })
  );

  return payload.project;
}

export async function updateProjectStatus(shareId, status, ownerToken = '') {
  const payload = await parseResponse(
    await fetch(`/api/projects/${shareId}/status`, {
      body: JSON.stringify({ status }),
      headers: {
        ...buildOwnerHeaders(ownerToken),
        'Content-Type': 'application/json'
      },
      method: 'PATCH'
    })
  );

  return payload.project;
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

export async function deleteAnnotation(shareId, annotationId, ownerToken) {
  return parseResponse(
    await fetch(`/api/videos/${shareId}/annotations/${annotationId}`, {
      headers: buildOwnerHeaders(ownerToken),
      method: 'DELETE'
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

export async function translateNote({ noteId, noteText, ownerToken, shareId }) {
  return parseResponse(
    await fetch(`/api/videos/${shareId}/notes/${noteId}/translation`, {
      body: JSON.stringify({ noteText }),
      headers: {
        ...buildOwnerHeaders(ownerToken),
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })
  );
}
