import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface KnowledgeBaseRef {
  docId: string;
  title: string;
  updatedAt: string;
}

/**
 * Returns the local folder path where a persona's knowledge base documents are stored.
 * Structure: ~/.personahub/workspaces/{personaId}/memory/
 */
export function getKBPath(personaId: string): string {
  return path.join(os.homedir(), '.personahub', 'workspaces', personaId, 'memory');
}

/**
 * Syncs knowledge base documents for a persona.
 * For each ref, checks if the local file exists and is up to date.
 * If missing or outdated, fetches from the API and writes locally.
 */
export async function syncKnowledgeBase(
  personaId: string,
  refs: KnowledgeBaseRef[],
  fetchDoc: (docId: string) => Promise<string>
): Promise<void> {
  const kbDir = getKBPath(personaId);

  // Ensure the directory exists
  fs.mkdirSync(kbDir, { recursive: true });

  for (const ref of refs) {
    const filePath = path.join(kbDir, `${ref.docId}.md`);

    // Check if we already have an up-to-date copy
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const localModified = stat.mtime.toISOString();
      const remoteUpdated = new Date(ref.updatedAt).toISOString();

      // Skip if local file was modified after the remote update
      if (localModified >= remoteUpdated) {
        continue;
      }
    }

    // Fetch and write the document
    const content = await fetchDoc(ref.docId);
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}
