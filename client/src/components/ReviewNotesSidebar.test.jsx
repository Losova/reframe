import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReviewNotesSidebar from './ReviewNotesSidebar.jsx';

function renderSidebar(overrides = {}) {
  const props = {
    annotationBucketMs: 250,
    annotations: [
      {
        annotationType: 'arrow',
        id: 'annotation-1',
        timestampMs: 12_000
      }
    ],
    annotationsAtCurrentTimestampCount: 1,
    annotationsCount: 3,
    currentBucket: 12,
    currentTimestampMs: 12_000,
    deletingAnnotationId: '',
    isOwner: true,
    noteSavePending: false,
    notes: [
      {
        aiTranslation: {
          actions: ['Push the pose more clearly', 'Hold the accent two frames longer'],
          summary: 'Clarify the storytelling pose and let the beat land longer.',
          tone: 'bolder'
        },
        createdAt: '2026-04-22T00:00:00.000Z',
        id: 'note-1',
        noteText: 'Can we make this hit harder?',
        sessionId: 'session-1234',
        timestampSeconds: 12.4
      }
    ],
    notesLoading: false,
    onDeleteAnnotation: vi.fn(),
    onSeek: vi.fn(),
    onSubmitNote: vi.fn().mockResolvedValue({}),
    onTranslate: vi.fn(),
    openAiConfigured: true,
    sessionId: 'session-1234',
    shareUrl: 'http://localhost:5173/v/123',
    translatingNoteId: '',
    ...overrides
  };

  render(<ReviewNotesSidebar {...props} />);

  return props;
}

describe('ReviewNotesSidebar', () => {
  it('seeks to the note timestamp and renders the AI translation card', () => {
    const props = renderSidebar();

    fireEvent.click(screen.getAllByRole('button', { name: '00:12' })[0]);

    expect(props.onSeek).toHaveBeenCalledWith(12.4);
    expect(
      screen.getByText('Clarify the storytelling pose and let the beat land longer.')
    ).toBeInTheDocument();
    expect(screen.getByText('Push the pose more clearly')).toBeInTheDocument();
    expect(screen.getByText('bolder')).toBeInTheDocument();
  });

  it('submits a new note from the input', async () => {
    const props = renderSidebar({ notes: [] });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Add a note at 00:12/i), {
        target: { value: 'Camera move feels abrupt' }
      });
      fireEvent.submit(screen.getByRole('textbox').closest('form'));
    });

    expect(props.onSubmitNote).toHaveBeenCalledWith('Camera move feels abrupt');
  });
});
