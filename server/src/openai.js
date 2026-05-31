const TRANSLATION_SYSTEM_PROMPT =
  'You are a creative director helping animators understand client feedback. ' +
  'Convert this vague client note into clear actionable creative direction. ' +
  'Return JSON only: { summary: string, actions: string[], tone: string }.';

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

export function isValidAiTranslation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const { actions, summary, tone } = value;

  return (
    typeof summary === 'string' &&
    summary.trim().length > 0 &&
    Array.isArray(actions) &&
    actions.length >= 1 &&
    actions.every((action) => typeof action === 'string' && action.trim().length > 0) &&
    typeof tone === 'string' &&
    tone.trim().length > 0
  );
}

export async function translateNoteWithOpenAI({ apiKey, noteText }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      instructions: TRANSLATION_SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          type: 'message',
          content: [
            {
              type: 'input_text',
              text: noteText.trim()
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'creative_direction',
          schema: TRANSLATION_SCHEMA,
          strict: true
        }
      }
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'OpenAI request failed.');
  }

  let outputText = payload.output_text ?? '';

  if (!outputText) {
    for (const output of payload.output ?? []) {
      for (const item of output.content ?? []) {
        if (typeof item.text === 'string' && item.text.trim()) {
          outputText = item.text;
          break;
        }
      }

      if (outputText) {
        break;
      }
    }
  }

  if (!outputText) {
    throw new Error('Empty response from OpenAI.');
  }

  const parsed = JSON.parse(outputText);

  if (!isValidAiTranslation(parsed)) {
    throw new Error('Unexpected AI response shape.');
  }

  return parsed;
}
