/**
 * Text normalizer for TTS — makes text sound natural when spoken aloud.
 * Strips Markdown, replaces URLs with "link", code blocks with "code block", etc.
 * Captions show the normalized text; the chat transcript keeps the original.
 */

const MAX_TTS_LENGTH = 2000;

/** Normalize text for speech synthesis */
export function normalizeForSpeech(text: string): string {
  if (!text || !text.trim()) return '';

  let result = text;

  // Remove code fences (```...```) → "code block"
  result = result.replace(/```[\s\S]*?```/g, 'code block');

  // Remove inline code (`...`) → just the content
  result = result.replace(/`([^`]+)`/g, '$1');

  // Remove Markdown links → just the text (before URL replacement!)
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Replace URLs → "link"
  result = result.replace(/https?:\/\/\S+/g, 'link');

  // Remove Markdown headings (# ## ### etc.)
  result = result.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic markers
  result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  result = result.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');

  // Remove strikethrough
  result = result.replace(/~~([^~]+)~~/g, '$1');

  // Remove image references
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1 image');

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, '');

  // Remove list markers (- * 1. 2. etc.)
  result = result.replace(/^\s*[-*+]\s+/gm, '');
  result = result.replace(/^\s*\d+\.\s+/gm, '');

  // Remove blockquote markers
  result = result.replace(/^\s*>\s+/gm, '');

  // Collapse multiple newlines into single pause
  result = result.replace(/\n{2,}/g, '. ');
  result = result.replace(/\n/g, ' ');

  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, ' ');

  // Trim
  result = result.trim();

  // Cap at maximum length using code-point iteration so we never slice
  // a UTF-16 surrogate pair in half (which would leave a lone surrogate
  // that some TTS providers reject).
  if (result.length > MAX_TTS_LENGTH) {
    const points = Array.from(result);
    result = points.slice(0, MAX_TTS_LENGTH - 3).join('') + '...';
  }

  return result;
}
