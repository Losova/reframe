import { startTransition, useEffect, useState } from 'react';
import {
  deleteAnnotation,
  fetchAnnotations,
  fetchNotes,
  saveAnnotation,
  saveNote,
  translateNote
} from '../lib/api.js';
import {
  mergeAnnotations,
  mergeNotes,
  sortAnnotations,
  sortNotes
} from '../lib/time.js';

export function useReviewData({ ownerToken = '', shareId }) {
  const [annotations, setAnnotations] = useState([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(true);
  const [annotationsError, setAnnotationsError] = useState('');
  const [annotationSaveError, setAnnotationSaveError] = useState('');
  const [annotationDeleteError, setAnnotationDeleteError] = useState('');
  const [deletingAnnotationId, setDeletingAnnotationId] = useState('');
  const [pendingAnnotationSaves, setPendingAnnotationSaves] = useState(0);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState('');
  const [noteSaveError, setNoteSaveError] = useState('');
  const [pendingNoteSaves, setPendingNoteSaves] = useState(0);
  const [translatingNoteId, setTranslatingNoteId] = useState('');
  const [noteTranslationError, setNoteTranslationError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadAnnotations() {
      setAnnotationsLoading(true);
      setAnnotationsError('');
      setAnnotations([]);

      try {
        const nextAnnotations = await fetchAnnotations(shareId);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setAnnotations(sortAnnotations(nextAnnotations));
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setAnnotationsError(error.message);
      } finally {
        if (isMounted) {
          setAnnotationsLoading(false);
        }
      }
    }

    loadAnnotations();

    return () => {
      isMounted = false;
    };
  }, [shareId]);

  useEffect(() => {
    let isMounted = true;

    async function loadNotes() {
      setNotesLoading(true);
      setNotesError('');
      setNotes([]);

      try {
        const nextNotes = await fetchNotes(shareId);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setNotes(sortNotes(nextNotes));
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setNotesError(error.message);
      } finally {
        if (isMounted) {
          setNotesLoading(false);
        }
      }
    }

    loadNotes();

    return () => {
      isMounted = false;
    };
  }, [shareId]);

  async function persistAnnotation(annotation) {
    setAnnotationSaveError('');
    setPendingAnnotationSaves((count) => count + 1);

    try {
      const savedAnnotation = await saveAnnotation(shareId, annotation);

      startTransition(() => {
        setAnnotations((currentAnnotations) =>
          mergeAnnotations(currentAnnotations, savedAnnotation)
        );
      });

      return savedAnnotation;
    } catch (error) {
      setAnnotationSaveError(error.message);
      throw error;
    } finally {
      setPendingAnnotationSaves((count) => Math.max(0, count - 1));
    }
  }

  async function removeAnnotation(annotationId) {
    if (!ownerToken) {
      setAnnotationDeleteError('Only the animator owner view can delete annotations.');
      return;
    }

    setAnnotationDeleteError('');
    setDeletingAnnotationId(annotationId);

    try {
      await deleteAnnotation(shareId, annotationId, ownerToken);

      startTransition(() => {
        setAnnotations((currentAnnotations) =>
          currentAnnotations.filter((annotation) => annotation.id !== annotationId)
        );
      });
    } catch (error) {
      setAnnotationDeleteError(error.message);
      throw error;
    } finally {
      setDeletingAnnotationId('');
    }
  }

  async function persistNote(note) {
    setNoteSaveError('');
    setPendingNoteSaves((count) => count + 1);

    try {
      const savedNote = await saveNote(shareId, note);

      startTransition(() => {
        setNotes((currentNotes) => mergeNotes(currentNotes, savedNote));
      });

      return savedNote;
    } catch (error) {
      setNoteSaveError(error.message);
      throw error;
    } finally {
      setPendingNoteSaves((count) => Math.max(0, count - 1));
    }
  }

  async function translateReviewNote(note) {
    setNoteTranslationError('');
    setTranslatingNoteId(note.id);

    try {
      const savedNote = await translateNote({
        noteId: note.id,
        noteText: note.noteText,
        ownerToken,
        shareId
      });

      startTransition(() => {
        setNotes((currentNotes) => mergeNotes(currentNotes, savedNote));
      });

      return savedNote;
    } catch (error) {
      setNoteTranslationError(error.message);
      throw error;
    } finally {
      setTranslatingNoteId('');
    }
  }

  return {
    annotationSaveError,
    annotationDeleteError,
    annotations,
    annotationsError,
    annotationsLoading,
    deletingAnnotationId,
    noteSaveError,
    noteTranslationError,
    notes,
    notesError,
    notesLoading,
    pendingAnnotationSaves,
    pendingNoteSaves,
    persistAnnotation,
    persistNote,
    removeAnnotation,
    translatingNoteId,
    translateReviewNote
  };
}
