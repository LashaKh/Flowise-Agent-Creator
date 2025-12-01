# Research: AI Persona Builder

## Phase 0: Technical Context Resolution

### 1. Flowise API Integration Pattern

**Decision**: Use Supabase Edge Functions as API proxy layer

**Rationale**:
- Flowise API key must remain server-side (security principle)
- Edge Functions provide serverless execution without infrastructure management
- Native integration with Supabase auth for user context
- Low latency EU region (eu-central-1) matches Flowise location

**Alternatives Considered**:
- Direct client-side calls: Rejected - exposes API key
- Dedicated backend server: Rejected - unnecessary complexity for MVP
- Vercel serverless: Rejected - adds external dependency when Supabase provides same capability

---

### 2. System Prompt Generation Strategy

**Decision**: Use Gemini 2.5 Pro via Supabase Edge Function for prompt generation

**Rationale**:
- Higher quality reasoning for researching famous person characteristics
- Edge Function keeps API key secure
- Structured output for consistent prompt format
- Can include web search grounding for accurate persona details

**Implementation Pattern**:
```typescript
// Edge Function: generate-persona-prompt
// Input: { personName: string }
// Output: { systemPrompt: string, personaMetadata: object }
```

**Alternatives Considered**:
- Client-side generation: Rejected - exposes Gemini API key
- Pre-built templates only: Rejected - less personalized results
- OpenAI GPT-4: Rejected - spec specifies Gemini

---

### 3. Flowise FlowData Structure

**Decision**: Use template-based node generation with dynamic system prompt injection

**Rationale**:
- Reference flowdata.json provides exact node structure
- Only systemMessage field needs dynamic replacement
- Credential IDs, tool IDs are constants (pre-configured in Flowise)
- Minimizes risk of malformed chatflow creation

**Verified Constants** (from reference):
| Component | ID |
|-----------|-----|
| Google Generative AI Credential | `f4e4f034-d71a-4039-b339-8dea1429fa06` |
| Upstash Redis Credential | `b88f589c-e0fd-4a2e-a353-0db6b491ac8e` |
| PerplexityWideSearch Tool | `f4e953b6-8f59-4969-820d-946d00c3456d` |

**Note**: Reference uses ChatOpenAI but spec requires ChatGoogleGenerativeAI. Will need to swap node type.

---

### 4. Frontend Technology Stack

**Decision**: React + TypeScript with Vite, TailwindCSS for styling

**Rationale**:
- Constitution specifies React + TypeScript
- Vite provides fast development experience
- TailwindCSS enables "modern, sleek UI" requirement with minimal custom CSS
- Supabase JS client has excellent React hooks support

**Key Libraries**:
- `@supabase/supabase-js` - Database and auth
- `@supabase/auth-helpers-react` - Auth hooks
- `react-hot-toast` - User feedback notifications
- `prism-react-renderer` - Python code syntax highlighting

---

### 5. Database Schema Design

**Decision**: Single `personas` table with RLS policies

**Rationale**:
- Simple data model (one main entity)
- User-scoped access via RLS
- JSON field for flexible settings storage
- Timestamps for observability

**Schema Preview**:
```sql
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  chatflow_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  api_endpoint TEXT NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Users can only access their own personas
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
```

---

### 6. Authentication Strategy

**Decision**: Supabase Auth with email/password (MVP), expandable to OAuth

**Rationale**:
- Minimal setup for MVP
- Integrates seamlessly with RLS
- Can add Google/GitHub OAuth later without schema changes
- Session management handled by Supabase client

---

### 7. Error Handling Patterns

**Decision**: Typed error responses with user-friendly messages

**Rationale**:
- Constitution requires "actionable and human-readable" errors
- Retry mechanism for transient Flowise failures
- Structured logging for debugging

**Error Categories**:
| Category | Example | User Message |
|----------|---------|--------------|
| Validation | Empty name | "Please enter a name for your persona" |
| Network | Flowise timeout | "Connection issue. Click to retry." |
| API | Flowise 500 | "Flowise is temporarily unavailable. Please try again." |
| Auth | Session expired | "Your session expired. Please sign in again." |

---

## Technology Best Practices Applied

### Supabase Edge Functions
- Use `Deno.env.get()` for secrets (never hardcode)
- Return early on auth failures
- Use `supabase.auth.getUser()` for user context
- Set appropriate CORS headers

### React + TypeScript
- Use React Query/TanStack Query for server state
- Type all API responses with interfaces
- Use Zod for runtime validation
- Keep components small and focused

### Flowise API
- Always validate response structure before processing
- Handle rate limits with exponential backoff
- Log all operations with correlation IDs
- Use deployed: true for immediate availability

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Which chat model node to use? | ChatGoogleGenerativeAI (gemini-2.5-flash) per spec |
| How to handle duplicate persona names? | Auto-increment suffix (e.g., "Einstein", "Einstein (2)") |
| Where to store Flowise API key? | Supabase Edge Function environment variable |
| Session management for memory? | Let Flowise generate sessionId per conversation |

---

## Phase 5: Chat Window Feature (Session 2025-12-01)

### 8. Chat Window Architecture

**Decision**: Full-page Chat section as third navigation tab, client-side direct calls to Flowise prediction API

**Rationale**:
- Flowise prediction endpoint is public (chatflowId-based), no API key exposure
- Streaming responses handled via SSE (Server-Sent Events) from Flowise
- Session-only state (React state) aligns with "testing" purpose
- No additional Edge Functions needed - reduces complexity

**Implementation Pattern**:
```typescript
// Direct call from frontend to Flowise prediction endpoint
const response = await fetch(`${FLOWISE_API_URL}/api/v1/prediction/${chatflowId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question, streaming: true })
});
// Handle SSE stream for real-time response display
```

**Alternatives Considered**:
- Edge Function proxy: Rejected - unnecessary for public prediction endpoint
- WebSocket: Rejected - Flowise uses SSE, not WebSocket
- Persistent chat history DB: Rejected - session-only per clarifications

---

### 9. Chat State Management

**Decision**: React useState for in-memory chat history, cleared on persona switch or navigation

**Rationale**:
- Simplest implementation (Principle 1: Simplicity First)
- No database schema changes needed
- Matches user expectation for "testing" workflow
- State automatically cleared on page refresh

**State Shape**:
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  error?: string;
}

interface ChatState {
  selectedPersonaId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  retryCount: number;
}
```

---

### 10. Error Handling & Retry Strategy

**Decision**: Auto-retry up to 3 times with exponential backoff, then show manual retry button

**Rationale**:
- Matches user clarification (Option C selected)
- Exponential backoff prevents API hammering
- Manual retry gives user control after auto-attempts fail
- Failed message preserved in UI for retry

**Implementation Pattern**:
```typescript
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

async function sendWithRetry(message: string, attempt = 0): Promise<string> {
  try {
    return await sendToFlowise(message);
  } catch (error) {
    if (attempt < 3) {
      await delay(RETRY_DELAYS[attempt]);
      return sendWithRetry(message, attempt + 1);
    }
    throw error; // Show manual retry button
  }
}
```

---

### 11. Navigation & Quick Actions

**Decision**: Add "Chat" tab in main nav + "Chat" button on each PersonaCard

**Rationale**:
- Matches user clarification (Option B: both navigation and quick action)
- Quick action from PersonaCard navigates to Chat with persona pre-selected
- Uses React Router state or URL params to pass selected persona

**URL Pattern**:
- Chat section: `/chat` or tab state `activeTab: 'chat'`
- Quick action link: Sets `activeTab: 'chat'` and `selectedChatPersona: persona`

---

### 12. Streaming Response Display

**Decision**: Display streaming response character-by-character with typing indicator

**Rationale**:
- Better UX than waiting for full response
- Flowise supports streaming via SSE
- Shows activity during long responses
- Typing indicator during stream

**Implementation Notes**:
- Use `EventSource` or `fetch` with `ReadableStream`
- Append chunks to message content as they arrive
- Set `isStreaming: true` during stream
- Handle stream completion and errors
