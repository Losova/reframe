import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidAiTranslation } from './openai.js';

test('isValidAiTranslation accepts the stored note translation shape', () => {
  assert.equal(
    isValidAiTranslation({
      actions: ['Increase contrast in the pose', 'Hold the beat for two more frames'],
      summary: 'Push the pose contrast and let the moment breathe longer.',
      tone: 'bolder'
    }),
    true
  );
});

test('isValidAiTranslation rejects incomplete translation payloads', () => {
  assert.equal(
    isValidAiTranslation({
      actions: [],
      summary: '',
      tone: ''
    }),
    false
  );
});
