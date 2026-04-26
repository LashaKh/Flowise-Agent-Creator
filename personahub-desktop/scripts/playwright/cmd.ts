/**
 * Thin CLI wrapper for the PersonaHub QA Playwright server.
 *
 * Usage:
 *   tsx scripts/playwright/cmd.ts navigate "http://localhost:5173"
 *   tsx scripts/playwright/cmd.ts --context agent02 click "button.primary"
 *   tsx scripts/playwright/cmd.ts stop
 *
 * The server (scripts/playwright/server.ts) holds one Electron instance
 * warm; every cmd invocation is a stateless HTTP request.
 */
import { argv, exit } from 'node:process';

const PORT = Number(process.env.QA_PORT ?? 7755);

interface ParsedArgs {
  context: string;
  verb: string;
  positional: string[];
}

function parseArgs(args: string[]): ParsedArgs {
  let context = 'default';
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context') {
      context = args[i + 1] ?? 'default';
      i++;
      continue;
    }
    rest.push(args[i]!);
  }
  const [verb, ...positional] = rest;
  if (!verb) {
    console.error(
      'usage: cmd.ts [--context NAME] <verb> [args...]\n' +
        'verbs: navigate url fill click screenshot wait waitfor text evaluate\n' +
        '       viewport select selectOption press count exists html clear stop health'
    );
    exit(2);
  }
  return { context, verb, positional };
}

function buildPayload(verb: string, positional: string[]): Record<string, unknown> {
  switch (verb) {
    case 'navigate':
      return { url: positional[0] };
    case 'fill':
    case 'selectOption':
    case 'select':
      return { selector: positional[0], value: positional[1] };
    case 'click':
    case 'waitfor':
    case 'text':
    case 'count':
    case 'exists':
    case 'html':
    case 'clear':
      return { selector: positional[0] };
    case 'screenshot':
      return { name: positional[0] };
    case 'wait':
      return { ms: Number(positional[0] ?? 1000) };
    case 'evaluate':
      return { script: positional[0] };
    case 'viewport':
      return { width: Number(positional[0]), height: Number(positional[1]) };
    case 'press':
      return { key: positional[0] };
    case 'url':
    case 'health':
    case 'stop':
      return {};
    default:
      return {};
  }
}

async function main() {
  const { context, verb, positional } = parseArgs(argv.slice(2));
  const payload = buildPayload(verb, positional);
  const urlPath = `/${verb}?context=${encodeURIComponent(context)}`;

  try {
    const res = await fetch(`http://localhost:${PORT}${urlPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`HTTP ${res.status}: ${text}`);
      exit(1);
    }
    console.log(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `Failed to reach qa-server on :${PORT} (${message}).\n` +
        'Start it with: pnpm qa:server'
    );
    exit(1);
  }
}

main();
