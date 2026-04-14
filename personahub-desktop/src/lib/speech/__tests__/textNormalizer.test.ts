import { describe, it, expect } from 'vitest';
import { normalizeForSpeech } from '../textNormalizer';

describe('textNormalizer', () => {
  it('returns empty for empty/whitespace input', () => {
    expect(normalizeForSpeech('')).toBe('');
    expect(normalizeForSpeech('   ')).toBe('');
    expect(normalizeForSpeech('\n\n')).toBe('');
  });

  it('strips code fences', () => {
    const input = 'Here is code:\n```javascript\nconst x = 1;\n```\nDone.';
    expect(normalizeForSpeech(input)).toContain('code block');
    expect(normalizeForSpeech(input)).not.toContain('const x');
  });

  it('strips inline code but keeps content', () => {
    expect(normalizeForSpeech('Use `npm install` to install')).toBe('Use npm install to install');
  });

  it('replaces URLs with "link"', () => {
    expect(normalizeForSpeech('Visit https://example.com for more')).toBe('Visit link for more');
    expect(normalizeForSpeech('See http://test.org/path?q=1')).toBe('See link');
  });

  it('strips Markdown headings', () => {
    expect(normalizeForSpeech('# Title\nContent')).toBe('Title Content');
    expect(normalizeForSpeech('### Deep heading')).toBe('Deep heading');
  });

  it('strips bold/italic markers', () => {
    expect(normalizeForSpeech('This is **bold** text')).toBe('This is bold text');
    expect(normalizeForSpeech('This is *italic* text')).toBe('This is italic text');
    expect(normalizeForSpeech('This is ***both*** text')).toBe('This is both text');
  });

  it('strips strikethrough', () => {
    expect(normalizeForSpeech('This is ~~wrong~~ right')).toBe('This is wrong right');
  });

  it('strips Markdown links but keeps text', () => {
    expect(normalizeForSpeech('[click here](https://example.com)')).toBe('click here');
  });

  it('strips list markers', () => {
    expect(normalizeForSpeech('- item one\n- item two')).toBe('item one item two');
    expect(normalizeForSpeech('1. first\n2. second')).toBe('first second');
  });

  it('strips blockquote markers', () => {
    expect(normalizeForSpeech('> quoted text')).toBe('quoted text');
  });

  it('collapses multiple newlines into pause', () => {
    const result = normalizeForSpeech('First\n\n\nSecond');
    expect(result).toContain('First');
    expect(result).toContain('Second');
  });

  it('handles emoji gracefully', () => {
    const result = normalizeForSpeech('Hello 👋 World 🌍');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('caps at 2000 characters', () => {
    const longInput = 'a'.repeat(5000);
    const result = normalizeForSpeech(longInput);
    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result.endsWith('...')).toBe(true);
  });

  it('handles normal text unchanged', () => {
    expect(normalizeForSpeech('Hello, how are you today?')).toBe('Hello, how are you today?');
  });
});
