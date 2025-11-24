---
name: playwright-automation
description: Browser automation via TypeScript scripts. Use for screenshots, web scraping, form filling, navigation. Token-efficient alternative to MCP.
version: 1.0.0
---

# Playwright Browser Automation

This skill provides browser automation capabilities through standalone TypeScript scripts, avoiding the token overhead of MCP tools.

## When to Use This Skill

- Taking screenshots of web pages
- Automating form submissions
- Web scraping and data extraction
- Testing web applications
- Navigating and interacting with web pages

## Quick Start

All scripts are in `scripts/playwright/` and run via `npx tsx`:

```bash
# Navigate to a page
npx tsx scripts/playwright/navigate.ts "https://example.com"

# Take a screenshot
npx tsx scripts/playwright/screenshot.ts

# Click a button
npx tsx scripts/playwright/click.ts "button:has-text('Submit')"

# Fill a form field
npx tsx scripts/playwright/fill.ts "#email" "user@example.com"

# Close browser when done
npx tsx scripts/playwright/close.ts
```

## Available Scripts

### Navigation
```bash
npx tsx scripts/playwright/navigate.ts <url> [options]
  --wait <state>     load | domcontentloaded | networkidle
  --timeout <ms>     Navigation timeout (default: 30000)
  --headless         Run without visible browser
```

### Screenshots
```bash
npx tsx scripts/playwright/screenshot.ts [options]
  --name <name>      Filename without extension
  --fullpage         Capture entire scrollable page
  --selector <sel>   Capture specific element
  --format <fmt>     png | jpeg
```

### Accessibility Snapshot
```bash
npx tsx scripts/playwright/snapshot.ts [options]
  --root <selector>      Start from specific element
  --interesting-only     Only interactive elements
  --max-depth <n>        Tree traversal depth
```

### Click Elements
```bash
npx tsx scripts/playwright/click.ts <selector> [options]
npx tsx scripts/playwright/click.ts --text "Button Text"
npx tsx scripts/playwright/click.ts --role button --name "Submit"
  --timeout <ms>     Wait timeout
  --force            Click even if hidden
  --double           Double-click
  --right            Right-click
```

### Fill Input Fields
```bash
npx tsx scripts/playwright/fill.ts <selector> <value> [options]
npx tsx scripts/playwright/fill.ts --label "Email" "user@example.com"
npx tsx scripts/playwright/fill.ts --placeholder "Enter text" "value"
  --no-clear         Don't clear existing value
  --press-enter      Press Enter after filling
```

### Execute JavaScript
```bash
npx tsx scripts/playwright/evaluate.ts "<expression>"
npx tsx scripts/playwright/evaluate.ts --file "./script.js"
  --stringify        Force JSON output for objects
```

### Wait for Conditions
```bash
npx tsx scripts/playwright/wait.ts [options]
  --selector <sel>   Wait for element
  --state <state>    visible | hidden | attached | detached
  --text <text>      Wait for text to appear
  --navigation       Wait for page navigation
  --network          Wait for network idle
  --url <pattern>    Wait for URL match (regex)
```

### Extract Data
```bash
npx tsx scripts/playwright/extract.ts [options]
  --text <selector>     Get text content
  --html <selector>     Get HTML content
  --attr <name> <sel>   Get attribute value
  --all <selector>      Extract from all matching elements
  --table <selector>    Extract table as JSON
  --links               Get all page links
  --forms               Get all form inputs
```

### Close Browser
```bash
npx tsx scripts/playwright/close.ts
```

## Common Workflows

### Login to a Website
```bash
npx tsx scripts/playwright/navigate.ts "https://app.example.com/login"
npx tsx scripts/playwright/fill.ts "#username" "myuser"
npx tsx scripts/playwright/fill.ts "#password" "mypass"
npx tsx scripts/playwright/click.ts "button[type=submit]"
npx tsx scripts/playwright/wait.ts --url "dashboard"
```

### Scrape Table Data
```bash
npx tsx scripts/playwright/navigate.ts "https://example.com/data"
npx tsx scripts/playwright/wait.ts --selector "#data-table"
npx tsx scripts/playwright/extract.ts --table "#data-table"
```

### Take Full Page Screenshot
```bash
npx tsx scripts/playwright/navigate.ts "https://example.com" --wait networkidle
npx tsx scripts/playwright/screenshot.ts --fullpage --name "full-page"
```

### Fill and Submit Form
```bash
npx tsx scripts/playwright/fill.ts --label "First Name" "John"
npx tsx scripts/playwright/fill.ts --label "Last Name" "Doe"
npx tsx scripts/playwright/fill.ts --label "Email" "john@example.com"
npx tsx scripts/playwright/click.ts --role button --name "Submit"
```

## Output Format

All scripts output JSON for easy parsing:

```json
{
  "success": true,
  "url": "https://example.com",
  "data": "...",
  "error": null
}
```

## State Management

- Browser state persists across script calls within a session
- State file: `/tmp/playwright-state.json`
- Screenshots saved to: `/tmp/playwright-screenshots/`
- Run `close.ts` to clean up when done

## Token Efficiency

This approach consumes tokens **only when scripts execute**, versus MCP which loads 10,000+ tokens upfront for tool schemas.

| Approach | Initial Cost | Per-Operation |
|----------|-------------|---------------|
| MCP      | ~10,000 tokens | Output only |
| Scripts  | ~100 tokens (this skill) | Output only |

**Savings: ~99% reduction in baseline token consumption**
