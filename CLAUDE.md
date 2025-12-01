# Flowise Agent Builder - Project Documentation

## Project Overview

An AI persona builder application that allows users to create, manage, and **chat with** custom AI personas powered by Google Gemini and Flowise. Each persona has a unique personality, knowledge domain, and communication style generated through AI prompt engineering.

## Technology Stack

### Frontend
- **React** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **React Hot Toast** for notifications
- **Prism React Renderer** for code highlighting

### Backend
- **Supabase** (PostgreSQL database + Auth + Edge Functions)
- **Flowise** (API endpoint: `https://flowise-2-0.onrender.com`)
- **Google Gemini 2.5 Pro** for prompt generation
- **Upstash Redis** for chat memory

### Tools & Integrations
- **PerplexityWideSearch** custom tool for web search capabilities
- **Supabase MCP Server** for database/function management

## Architecture

### Database Schema (Supabase)
```sql
personas table:
- id: uuid (primary key)
- user_id: uuid (foreign key to auth.users)
- name: text
- chatflow_id: text (Flowise chatflow ID)
- system_prompt: text (generated AI prompt)
- api_endpoint: text (Flowise prediction endpoint)
- status: text (creating/active/failed/deleted)
- error_message: text (optional)
- settings: jsonb (temperature, model, etc.)
- created_at: timestamp
- updated_at: timestamp
```

### Edge Functions

#### `/personas` - Main CRUD + Prompt Generation (Single Function)
- **GET**: List all active personas for authenticated user
- **GET /:id**: Get single persona details
- **POST**: Create new persona (generates prompt via embedded Gemini call, creates Flowise chatflow)
- **PATCH /:id**: Update persona settings/system prompt
- **DELETE /:id**: Soft delete persona (marks as deleted, removes Flowise chatflow)

**Current Version**: v21

**Key Features**:
- Authentication required (JWT token via Authorization header)
- **Prompt generation embedded directly** (calls Gemini API using `GEMINI_API_KEY` env variable)
- Creates complete Flowise chatflow with:
  - Upstash Redis memory node
  - ChatGoogleGenerativeAI model node (gemini-2.5-flash)
  - Custom Tool node (PerplexityWideSearch)
  - Tool Agent node with system message
- Returns camelCase JSON (transforms from snake_case database fields)

**Environment Variables Used**:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations
- `GEMINI_API_KEY` - Google Gemini API key for prompt generation
- `FLOWISE_BASE_URL` - Flowise API URL (defaults to `https://flowise-2-0.onrender.com`)
- `FLOWISE_API_KEY` - Flowise API key

**Note**: The `generate-prompt` function is deprecated and can be safely deleted. All prompt generation is now embedded in the `personas` function.

### Flowise Integration

#### Chatflow Structure
Each persona gets a dedicated Flowise chatflow with 4 nodes:

1. **Upstash Redis Memory** (`upstashRedisBackedChatMemory_0`)
   - Stores conversation history
   - Base URL: `https://obliging-zebra-56633.upstash.io`
   - Credential ID: `b88f589c-e0fd-4a2e-a353-0db6b491ac8e`

2. **ChatGoogleGenerativeAI** (`chatGoogleGenerativeAI_0`)
   - Model: `gemini-2.5-flash`
   - Temperature: `0.7` (configurable per persona)
   - Streaming: enabled
   - Credential ID: `f4e4f034-d71a-4039-b339-8dea1429fa06`

3. **Custom Tool** (`customTool_0`)
   - Tool: PerplexityWideSearch (ID: `f4e953b6-8f59-4969-820d-946d00c3456d`)
   - Webhook: `https://hook.eu2.make.com/ndg51e64dziugrklc4xag3a55niyv570`
   - Provides web search capability to personas

4. **Tool Agent** (`toolAgent_0`)
   - System message: Generated persona prompt
   - Connects all nodes together
   - Handles tool calling via function calling

#### Flowise API Endpoints
- Create: `POST /api/v1/chatflows`
- Update: `PUT /api/v1/chatflows/:id`
- Delete: `DELETE /api/v1/chatflows/:id`
- Predict: `POST /api/v1/prediction/:chatflowId`

## Frontend Components

### Main Components
- **App.tsx**: Main application container, handles auth state, persona CRUD, tab navigation (Create/My Personas/Chat)
- **Auth.tsx**: Google OAuth authentication
- **PersonaForm.tsx**: Form to create new personas
- **PersonaList.tsx**: Grid display of persona cards
- **PersonaCard.tsx**: Individual persona card with status badge and actions
- **SettingsPanel.tsx**: Edit persona settings and system prompt
- **ApiEndpointDisplay.tsx**: Shows API endpoint with copy functionality
- **DeleteConfirmation.tsx**: Modal for delete confirmation

### Chat Components (New)
- **ChatWindow.tsx**: Main chat interface combining persona selection, message display, and input
- **ChatMessage.tsx**: Individual chat message bubble (user/assistant)
- **ChatInput.tsx**: Text input with send button for chat
- **PersonaSelector.tsx**: Dropdown to select which persona to chat with

### Custom Hooks
- **usePersonas.ts**: Fetches all personas for current user (transforms date strings to Date objects)
- **useCreatePersona.ts**: Creates new persona (transforms date strings to Date objects)
- **useUpdatePersona.ts**: Updates persona settings/prompt (transforms date strings to Date objects)
- **useDeletePersona.ts**: Handles persona deletion (uses direct fetch for proper DELETE URL construction)
- **useChat.ts**: Manages chat state, streaming messages, auto-retry with exponential backoff

### Chat Library
- **lib/flowise-chat.ts**: Flowise chat client with streaming support, error handling, and SSE parsing

## Environment Variables

### Supabase Edge Function Secrets (set in Supabase Dashboard)
```bash
GEMINI_API_KEY=<your-gemini-api-key>  # Required for prompt generation
FLOWISE_API_KEY=<your-flowise-api-key>  # Required for Flowise operations
FLOWISE_BASE_URL=https://flowise-2-0.onrender.com  # Optional, has default
```

### Frontend Environment Variables (.env)
```bash
# Flowise (for direct chat from frontend)
VITE_FLOWISE_API_URL=https://flowise-2-0.onrender.com
VITE_FLOWISE_API_KEY=ijD+kfSjYMcqEyBHNCHyEaymDzrD7br4BW4/DRe/eYI=

# Supabase
VITE_SUPABASE_URL=https://wlvfilxtvqjzwqjhfcdk.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Key Implementation Details

### 1. Persona Creation Flow
1. User enters persona name in Create tab
2. Frontend calls `/personas` POST endpoint
3. Edge function creates persona record with status='creating'
4. **Generates system prompt via embedded Gemini call** (2.5 Pro, temp 0.1, 5000 max tokens)
5. Creates Flowise chatflow with generated prompt
6. Updates persona record with chatflow_id, api_endpoint, status='active'
7. Transforms response from snake_case to camelCase
8. Returns complete persona to frontend
9. Frontend hook converts date strings to Date objects

### 2. Chat Flow (New)
1. User selects Chat tab
2. User selects a persona from PersonaSelector dropdown
3. useChat hook initializes with persona's chatflowId
4. User types message in ChatInput
5. Message sent to Flowise prediction endpoint with sessionId (for memory)
6. Response streamed via SSE, displayed in real-time
7. Auto-retry (3 attempts) with exponential backoff on network errors
8. Session cleared when persona changes

### 3. Response Transformation Pattern
**Edge Function → Frontend**:
- Database returns: `system_prompt`, `chatflow_id`, `created_at`, etc. (snake_case)
- Edge function transforms to: `systemPrompt`, `chatflowId`, `createdAt`, etc. (camelCase)
- Frontend hooks convert: date strings → Date objects

### 4. Chat Streaming Implementation
- Uses Server-Sent Events (SSE) for real-time streaming
- `parseStream()` handles both JSON and SSE response formats
- ChatError class with typed error codes (NETWORK, API, STREAM)
- Exponential backoff: 1000ms, 2000ms, 4000ms delays
- Max 3 auto-retry attempts, then manual retry available

### 5. Prompt Generation Template
Uses complete Einstein example as template format:
- Gemini receives full markdown structure to replicate
- `replaceAll('{name}')` replaces all occurrences
- System instruction tells Gemini it's a formatting assistant
- Temperature 0.1 for highly consistent structured output
- 5000 max tokens for comprehensive prompts (~2000 words)

**Prompt Structure** (7 sections):
1. Identity & Style
2. Communication Style
3. Knowledge & Expertise
4. Interaction & Engagement
5. Constraints & Guidelines
6. Tools (PerplexityWideSearch)
7. Final Notes

## Recent Fixes & Improvements

### Session 3 (2025-12-01)
1. **Fixed Gemini API key leak issue**:
   - Previous API key was reported as leaked and disabled by Google
   - Updated edge function to read `GEMINI_API_KEY` from Supabase secrets
   - Removed all hardcoded API keys from deployed functions
2. **Consolidated to single edge function**:
   - Merged `generate-prompt` functionality into `personas` function
   - Eliminated inter-function JWT auth issues
   - `generate-prompt` function is now deprecated (can be safely deleted)
3. **Deployed personas function v21** with:
   - Environment variable for GEMINI_API_KEY
   - Embedded prompt generation (no separate function call)
   - All configuration via Supabase secrets

### Session 2 (2025-11-24)
1. Fixed prompt generation not being called
2. Updated Gemini API key after leak
3. Added response transformation (snake_case → camelCase)
4. Fixed date parsing error in frontend hooks

### Session 1 (2025-11-24)
1. Fixed DELETE persona endpoint
2. Fixed Custom Tool fields being empty
3. Increased prompt generation max tokens
4. Enhanced prompt template

## Chat Feature Types

```typescript
// Chat message in conversation
interface ChatMessage {
  id: string;                    // UUID for React key
  role: 'user' | 'assistant';   // Message sender
  content: string;              // Message text
  timestamp: Date;              // When message was sent/received
  isStreaming?: boolean;        // True while assistant response is streaming
  error?: string;               // Error message if send failed
}

// Chat state (managed by useChat hook)
interface ChatState {
  selectedPersonaId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  retryCount: number;
  lastFailedMessage?: string;
}
```

## API Endpoints Summary

### Frontend → Supabase Edge Functions
- `POST /functions/v1/personas` - Create persona
- `GET /functions/v1/personas` - List personas
- `GET /functions/v1/personas/:id` - Get persona
- `PATCH /functions/v1/personas/:id` - Update persona
- `DELETE /functions/v1/personas/:id` - Delete persona

### Frontend → Flowise (Direct Chat)
- `POST /api/v1/prediction/:chatflowId` - Send chat message (streaming)

### Edge Functions → External Services
- Gemini API: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent`
- Flowise API: `https://flowise-2-0.onrender.com/api/v1/*`

## Development Commands

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Build for production
pnpm build

# Deploy Edge Functions (via MCP)
# Use mcp__supabase_flowise__deploy_edge_function tool
```

## Project Structure

```
flowise-agent-builder/
├── src/
│   ├── components/
│   │   ├── Auth.tsx
│   │   ├── PersonaForm.tsx
│   │   ├── PersonaList.tsx
│   │   ├── PersonaCard.tsx
│   │   ├── SettingsPanel.tsx
│   │   ├── ApiEndpointDisplay.tsx
│   │   ├── DeleteConfirmation.tsx
│   │   ├── ChatWindow.tsx          # New - Main chat interface
│   │   ├── ChatMessage.tsx         # New - Chat message bubble
│   │   ├── ChatInput.tsx           # New - Chat input field
│   │   └── PersonaSelector.tsx     # New - Persona dropdown
│   ├── hooks/
│   │   ├── usePersonas.ts
│   │   ├── useCreatePersona.ts
│   │   ├── useUpdatePersona.ts
│   │   ├── useDeletePersona.ts
│   │   └── useChat.ts              # New - Chat state management
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── env.ts
│   │   └── flowise-chat.ts         # New - Flowise chat client
│   ├── types/
│   │   └── index.ts                # Includes ChatMessage, ChatState types
│   ├── App.tsx                     # Updated with Chat tab
│   └── main.tsx
├── supabase/
│   └── functions/
│       ├── _shared/                # Shared utilities
│       └── personas/               # Main CRUD + prompt generation
├── specs/
│   └── 001-ai-persona-builder/
│       └── contracts/
│           └── flowise-chatflow.ts # Flowise API contracts
├── public/
└── [config files]
```

## Troubleshooting

### Common Issues

1. **"API key was reported as leaked"**
   - Generate new Gemini API key at https://aistudio.google.com/app/apikey
   - Set `GEMINI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets
   - Redeploy personas function

2. **"Invalid JWT" error on persona creation**
   - This was caused by function-to-function calls with JWT verification
   - Fixed by embedding prompt generation directly in personas function
   - Ensure personas function is v21 or later

3. **Chat not working / streaming errors**
   - Check Flowise server is running
   - Verify chatflowId is correct for the persona
   - Check browser console for CORS errors

### Debugging Tools
- Supabase Edge Function logs: `mcp__supabase_flowise__get_logs`
- Database queries: `mcp__supabase_flowise__execute_sql`
- Flowise dashboard: https://flowise-2-0.onrender.com
