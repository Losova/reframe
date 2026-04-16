/**
 * Sends a note to the server-side /api/translate endpoint.
 * The OpenAI API key is kept on the server and is never exposed to the browser.
 */
export async function translateClientNote(noteText) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ noteText })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || 'Translation failed. Please try again.');
  }

  return payload;
}
