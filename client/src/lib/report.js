import { jsPDF } from 'jspdf';
import { formatTimestampBadge } from './time.js';

const PAGE_MARGIN_X = 48;
const PAGE_MARGIN_Y = 52;
const LINE_HEIGHT = 16;
const CARD_PADDING = 14;
const CARD_WIDTH = 515;

function cleanText(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.replace(/\s+/g, ' ').trim() || fallback;
}

function addWrappedText(doc, text, x, y, width) {
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * LINE_HEIGHT;
}

function ensurePageSpace(doc, y, neededHeight) {
  const pageHeight = doc.internal.pageSize.getHeight();

  if (y + neededHeight <= pageHeight - PAGE_MARGIN_Y) {
    return y;
  }

  doc.addPage();
  return PAGE_MARGIN_Y;
}

function drawCard(doc, y, height) {
  doc.setDrawColor(51, 65, 85);
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(PAGE_MARGIN_X, y, CARD_WIDTH, height, 12, 12, 'FD');
}

function buildReportFilename(projectTitle) {
  const slug = cleanText(projectTitle, 'translate-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${slug || 'translate-report'}.pdf`;
}

export function downloadProjectReport({
  annotations,
  notes,
  project,
  shareUrl
}) {
  const doc = new jsPDF({
    format: 'letter',
    unit: 'pt'
  });

  const projectTitle = cleanText(project?.title, 'Untitled Review');
  const reviewUrl = cleanText(shareUrl || project?.shareUrl, '');
  const createdDate = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  let y = PAGE_MARGIN_Y;

  doc.setFillColor(7, 12, 24);
  doc.setDrawColor(34, 211, 238);
  doc.roundedRect(PAGE_MARGIN_X, y, CARD_WIDTH, 108, 18, 18, 'FD');
  doc.setTextColor(103, 232, 249);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TRANSLATE REPORT', PAGE_MARGIN_X + 18, y + 24);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text(projectTitle, PAGE_MARGIN_X + 18, y + 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated ${createdDate}`, PAGE_MARGIN_X + 18, y + 72);
  if (reviewUrl) {
    doc.text(reviewUrl, PAGE_MARGIN_X + 18, y + 90, {
      maxWidth: CARD_WIDTH - 36
    });
  }
  y += 136;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(226, 232, 240);
  doc.text('Timestamped Notes', PAGE_MARGIN_X, y);
  y += 18;

  if (notes.length === 0) {
    y = ensurePageSpace(doc, y, 56);
    drawCard(doc, y, 56);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text('No notes recorded yet.', PAGE_MARGIN_X + CARD_PADDING, y + 30);
    y += 72;
  } else {
    notes.forEach((note) => {
      const noteLines = doc.splitTextToSize(
        cleanText(note.noteText, 'No note text'),
        CARD_WIDTH - CARD_PADDING * 2
      );
      const summaryText = cleanText(note.aiTranslation?.summary, '');
      const summaryLines = summaryText
        ? doc.splitTextToSize(summaryText, CARD_WIDTH - CARD_PADDING * 2)
        : [];
      const actionLines = Array.isArray(note.aiTranslation?.actions)
        ? note.aiTranslation.actions.map((action) =>
            doc.splitTextToSize(
              `• ${cleanText(action)}`,
              CARD_WIDTH - CARD_PADDING * 2 - 8
            )
          )
        : [];

      const noteHeight =
        44 +
        noteLines.length * LINE_HEIGHT +
        (summaryLines.length ? 26 + summaryLines.length * LINE_HEIGHT : 0) +
        actionLines.reduce((height, lines) => height + lines.length * LINE_HEIGHT, 0) +
        (actionLines.length ? 8 : 0);

      y = ensurePageSpace(doc, y, noteHeight + 16);
      drawCard(doc, y, noteHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(103, 232, 249);
      doc.text(
        formatTimestampBadge(note.timestampSeconds),
        PAGE_MARGIN_X + CARD_PADDING,
        y + 22
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(226, 232, 240);
      let cursorY = addWrappedText(
        doc,
        cleanText(note.noteText, 'No note text'),
        PAGE_MARGIN_X + CARD_PADDING,
        y + 42,
        CARD_WIDTH - CARD_PADDING * 2
      );

      if (summaryLines.length) {
        cursorY += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(251, 191, 36);
        doc.text('AI Translation', PAGE_MARGIN_X + CARD_PADDING, cursorY);
        cursorY += 14;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        cursorY = addWrappedText(
          doc,
          summaryText,
          PAGE_MARGIN_X + CARD_PADDING,
          cursorY,
          CARD_WIDTH - CARD_PADDING * 2
        );

        if (actionLines.length) {
          cursorY += 6;
          doc.setTextColor(226, 232, 240);
          actionLines.forEach((lines) => {
            doc.text(lines, PAGE_MARGIN_X + CARD_PADDING + 8, cursorY);
            cursorY += lines.length * LINE_HEIGHT;
          });
        }
      }

      y += noteHeight + 16;
    });
  }

  y = ensurePageSpace(doc, y + 6, 44);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(226, 232, 240);
  doc.text('Annotation Timestamps', PAGE_MARGIN_X, y);
  y += 18;

  const annotationTimestamps = [...new Set(
    annotations.map((annotation) => formatTimestampBadge(annotation.timestampMs / 1000))
  )];

  if (annotationTimestamps.length === 0) {
    y = ensurePageSpace(doc, y, 56);
    drawCard(doc, y, 56);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text('No annotations recorded yet.', PAGE_MARGIN_X + CARD_PADDING, y + 30);
  } else {
    const timestampText = annotationTimestamps.join('   •   ');
    const lines = doc.splitTextToSize(timestampText, CARD_WIDTH - CARD_PADDING * 2);
    const cardHeight = 26 + lines.length * LINE_HEIGHT;

    y = ensurePageSpace(doc, y, cardHeight + 16);
    drawCard(doc, y, cardHeight);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(226, 232, 240);
    doc.text(lines, PAGE_MARGIN_X + CARD_PADDING, y + 26);
  }

  doc.save(buildReportFilename(projectTitle));
}
