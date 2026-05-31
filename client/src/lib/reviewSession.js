const SESSION_STORAGE_KEY = 'translate:session-id';

export function getOrCreateReviewSessionId() {
  try {
    const existingSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (existingSessionId) {
      return existingSessionId;
    }

    const nextSessionId = window.crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    return nextSessionId;
  } catch {
    return window.crypto.randomUUID();
  }
}
