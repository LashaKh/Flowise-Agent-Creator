/**
 * Document Converter
 *
 * Converts uploaded files (PDF, DOCX, TXT, MD) to plain text so they can be
 * dropped into an OpenClaw agent's workspace for RAG (retrieval-augmented generation).
 *
 * Think of it as a "text extractor" — whatever the file format, we pull out
 * the readable text and return it as a simple string.
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

/**
 * Convert a file to plain text.
 * @returns { text, title } where title is the filename without extension.
 */
export async function convertDocument(
  filePath: string
): Promise<{ text: string; title: string }> {
  const ext = path.extname(filePath).toLowerCase();
  const title = path.basename(filePath, ext);

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported file type: ${ext}. Supported: PDF, DOCX, TXT, MD`
    );
  }

  let text: string;

  if (ext === '.pdf') {
    // Dynamic import to avoid bundling heavy PDF lib at startup
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(filePath);
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (ext === '.docx') {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } else {
    // .txt or .md — already plain text
    text = fs.readFileSync(filePath, 'utf-8');
  }

  if (!text.trim()) {
    throw new Error('Document appears to be empty — no text could be extracted.');
  }

  return { text, title };
}
