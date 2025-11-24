# Flowise Agent Builder - Project Documentation

## Project Overview

An AI persona builder application that allows users to create, manage, and interact with custom AI personas powered by Google Gemini and Flowise. Each persona has a unique personality, knowledge domain, and communication style generated through AI prompt engineering.

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

#### 1. `/personas` - Main CRUD operations
- **GET**: List all active personas for authenticated user
- **GET /:id**: Get single persona details
- **POST**: Create new persona (generates prompt via Gemini, creates Flowise chatflow)
- **PATCH /:id**: Update persona settings/system prompt
- **DELETE /:id**: Soft delete persona (marks as deleted, removes Flowise chatflow)

**Key Features**:
- Authentication required (JWT token via Authorization header)
- Prompt generation embedded directly in function (using Gemini 2.5 Pro)
- Creates complete Flowise chatflow with:
  - Upstash Redis memory node
  - ChatGoogleGenerativeAI model node (gemini-2.5-flash)
  - Custom Tool node (PerplexityWideSearch)
  - Tool Agent node with system message
- Returns camelCase JSON (transforms from snake_case database fields)

**Current Version**: v18

#### 2. `/generate-prompt` - AI Prompt Generation (Standalone - Not Currently Used)
- **POST**: Generates comprehensive system prompts using Gemini 2.5 Pro
- Takes persona name as input
- Returns structured markdown prompt following Einstein template format
- **Note**: Prompt generation is now embedded in personas function to avoid JWT auth complexity

**Configuration**:
- Model: `gemini-2.5-pro`
- Temperature: `0.1` (lowered for consistent structured output)
- Max tokens: `5000`
- System instruction: Acts as markdown formatting assistant

**Prompt Structure** (7 sections):
1. Identity & Style
2. Communication Style
3. Knowledge & Expertise
4. Interaction & Engagement
5. Constraints & Guidelines
6. Tools (PerplexityWideSearch)
7. Final Notes

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
- **App.tsx**: Main application container, handles auth state, persona CRUD
- **Auth.tsx**: Google OAuth authentication
- **PersonaForm.tsx**: Form to create new personas
- **PersonaList.tsx**: Grid display of persona cards
- **PersonaCard.tsx**: Individual persona card with status badge and actions
- **SettingsPanel.tsx**: Edit persona settings and system prompt
- **ApiEndpointDisplay.tsx**: Shows API endpoint with copy functionality
- **DeleteConfirmation.tsx**: Modal for delete confirmation

### Custom Hooks
- **usePersonas.ts**: Fetches all personas for current user (transforms date strings to Date objects)
- **useCreatePersona.ts**: Creates new persona (transforms date strings to Date objects)
- **useUpdatePersona.ts**: Updates persona settings/prompt (transforms date strings to Date objects)
- **useDeletePersona.ts**: Handles persona deletion (uses direct fetch instead of `supabase.functions.invoke` for proper DELETE URL construction)

## Environment Variables

```bash
# Gemini API (Updated 2025-11-24)
VITE_GEMINI_API_KEY=AIzaSyCryhy0k4FumsZBi7WTa8IWOA80mmp44Ls

# Flowise
VITE_FLOWISE_API_URL=https://flowise-2-0.onrender.com
VITE_FLOWISE_API_KEY=ijD+kfSjYMcqEyBHNCHyEaymDzrD7br4BW4/DRe/eYI=

# Flowise Node IDs
FLOWISE_GOOGLE_AI_CREDENTIAL_ID=f4e4f034-d71a-4039-b339-8dea1429fa06
FLOWISE_UPSTASH_CREDENTIAL_ID=b88f589c-e0fd-4a2e-a353-0db6b491ac8e
FLOWISE_UPSTASH_BASE_URL=https://obliging-zebra-56633.upstash.io
FLOWISE_PERPLEXITY_TOOL_ID=f4e953b6-8f59-4969-820d-946d00c3456d

# Supabase
VITE_SUPABASE_URL=https://wlvfilxtvqjzwqjhfcdk.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Key Implementation Details

### 1. Persona Creation Flow
1. User enters persona name
2. Frontend calls `/personas` POST endpoint
3. Edge function creates persona record with status='creating'
4. Generates system prompt via embedded Gemini call (2.5 Pro, temp 0.1, 5000 max tokens)
5. Creates Flowise chatflow with generated prompt
6. Updates persona record with chatflow_id, api_endpoint, status='active'
7. Transforms response from snake_case to camelCase
8. Returns complete persona to frontend
9. Frontend hook converts date strings to Date objects

### 2. Response Transformation Pattern
**Edge Function → Frontend**:
- Database returns: `system_prompt`, `chatflow_id`, `created_at`, etc. (snake_case)
- Edge function transforms to: `systemPrompt`, `chatflowId`, `createdAt`, etc. (camelCase)
- Frontend hooks convert: date strings → Date objects

This two-step transformation ensures:
- Clean API contract (camelCase JSON)
- Type safety (Date objects in React components)
- No JSON serialization issues (dates sent as strings over HTTP)

### 3. DELETE Request Fix
The `useDeletePersona` hook uses direct `fetch()` instead of `supabase.functions.invoke()` because:
- `invoke()` doesn't properly pass personaId in URL path
- Edge function expects personaId in path: `/personas/{personaId}`
- Direct fetch constructs proper URL: `${VITE_SUPABASE_URL}/functions/v1/personas/${personaId}`

### 4. Tool Configuration Fix
The Custom Tool node previously had empty field values which overrode the saved tool definition. Fixed by:
- Removing empty string values from `inputs` object
- Only keeping `selectedTool` and `returnDirect` in inputs
- Making custom fields optional in `inputParams`
- Allows Flowise to load tool definition from saved PerplexityWideSearch tool

### 5. Prompt Generation Template
Uses complete Einstein example as template format to copy:
- Gemini receives full markdown structure to replicate
- `replaceAll('{name}')` replaces all occurrences (not just first)
- System instruction tells Gemini it's a formatting assistant
- Temperature 0.1 for highly consistent structured output
- 5000 max tokens for comprehensive prompts (~2000 words)

## Recent Fixes & Improvements

### Session 1 (2025-01-24)
1. Fixed DELETE persona endpoint (400 error - uses direct fetch with personaId in URL)
2. Fixed Custom Tool fields being empty (now properly loads from saved tool)
3. Increased prompt generation max tokens (1024 → 5000)
4. Enhanced prompt template to match Einstein quality standard
5. Fixed template not being followed (added complete example, lowered temp to 0.3)
6. Deployed updated `generate-prompt` Edge Function (version 4)
7. Added system instruction for Gemini as markdown formatting assistant

### Session 2 (2025-11-24)
1. Fixed prompt generation not being called (personas function had embedded basic generation)
2. Updated Gemini API key after previous key was leaked and disabled by Google
3. Embedded prompt generation directly in personas function (avoids JWT auth complexity)
4. **Added response transformation in personas edge function (v18)**:
   - Created `transformPersona()` function to convert snake_case → camelCase
   - Applied to all handlers: GET (single + list), POST, PATCH
   - systemPrompt field now properly returned to frontend
5. **Fixed date parsing error in frontend**:
   - Added date string → Date object conversion in `useCreatePersona.ts`
   - Added date string → Date object conversion in `usePersonas.ts`
   - Added date string → Date object conversion in `useUpdatePersona.ts`
   - Resolves "Invalid time value" RangeError in PersonaCard

**Architectural Decisions**:
- Edge functions return camelCase JSON (API contract)
- Frontend hooks handle date deserialization (string → Date)
- Prompt generation embedded (avoids inter-function auth issues)
- Gemini temperature lowered to 0.1 for better template adherence

## API Endpoints Summary

### Frontend → Supabase Edge Functions
- `POST /functions/v1/personas` - Create persona
- `GET /functions/v1/personas` - List personas
- `GET /functions/v1/personas/:id` - Get persona
- `PATCH /functions/v1/personas/:id` - Update persona
- `DELETE /functions/v1/personas/:id` - Delete persona

### Edge Functions → External Services
- Gemini API: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent`
- Flowise API: `https://flowise-2-0.onrender.com/api/v1/*`
- PerplexityWideSearch: `https://hook.eu2.make.com/ndg51e64dziugrklc4xag3a55niyv570`

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

## Known Issues & Future Improvements

### Current Limitations
- No pagination for persona list
- No search/filter functionality
- Can't export/import personas
- No conversation history UI
- No analytics or usage tracking

### Potential Enhancements
1. Add conversation UI within the app (currently only API endpoint provided)
2. Implement persona sharing/marketplace
3. Add prompt versioning and A/B testing
4. Support for voice interactions
5. Multi-language persona support
6. Advanced settings (top_p, top_k, frequency_penalty)
7. Persona templates/categories
8. Collaborative editing

## Project Structure

```
flowise-agent-builder/
├── src/
│   ├── components/          # React components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility libraries (supabase client)
│   ├── types/              # TypeScript type definitions
│   ├── App.tsx             # Main app component
│   └── main.tsx            # Entry point
├── supabase/
│   └── functions/
│       ├── _shared/        # Shared utilities (cors, flowise client)
│       ├── generate-prompt/# Prompt generation function (standalone)
│       └── personas/       # CRUD operations function
├── public/                 # Static assets
└── [config files]         # vite, tsconfig, tailwind, etc.
```

## Contact & Support

For issues or questions:
- Check Supabase Edge Function logs: `mcp__supabase_flowise__get_logs`
- Review Flowise chatflow in dashboard: https://flowise-2-0.onrender.com
- Monitor Gemini API usage in Google Cloud Console
