# Tasks: AI Persona Builder

## Overview

**Feature**: Automatic AI Persona Chatflow Generator for Flowise
**Branch**: `1-ai-persona-builder`
**Total Tasks**: 54
**Estimated Phases**: 8

## User Story Summary

| Story | Priority | Description | Task Count | Status |
|-------|----------|-------------|------------|--------|
| US1 | P1 | Create persona by name input | 8 | DONE |
| US2 | P2 | Display API endpoint with Python code | 4 | DONE |
| US3 | P3 | Edit system prompt and settings | 6 | DONE |
| US4 | P4 | View and manage persona history | 6 | DONE |
| US5 | P5 | Test personas via built-in chat window | 12 | DONE |

## Dependency Graph

```
Phase 1 (Setup) ──┐
                  ├──→ Phase 2 (Foundation) ──┐
                  │                           │
                  │    ┌──────────────────────┘
                  │    │
                  │    ├──→ Phase 3 (US1: Create Persona) ──┐
                  │    │                                     │
                  │    │    ┌────────────────────────────────┤
                  │    │    │                                │
                  │    │    ├──→ Phase 4 (US2: API Display)  │  ✓ DONE
                  │    │    │                                │
                  │    │    ├──→ Phase 5 (US3: Edit Settings)│  ✓ DONE
                  │    │    │                                │
                  │    │    ├──→ Phase 6 (US4: History)      │  ✓ DONE
                  │    │    │                                │
                  │    │    └──→ Phase 8 (US5: Chat Window)  │  ← NEW
                  │    │                                     │
                  │    └─────────────────────────────────────┘
                  │
                  └──→ Phase 7 (Polish) ✓ DONE
```

**Note**: US5 (Chat Window) can be implemented independently after Phase 7 completes.

---

## Phase 1: Setup

**Goal**: Initialize project structure and development environment

### Tasks

- [X] T001 Initialize React + TypeScript + Vite project in project root
  ```bash
  pnpm create vite@latest . --template react-ts
  ```

- [X] T002 [P] Install core dependencies
  ```bash
  pnpm add @supabase/supabase-js react-hot-toast
  pnpm add -D tailwindcss postcss autoprefixer @types/node
  ```

- [X] T003 [P] Configure TailwindCSS in `tailwind.config.js`

- [X] T004 [P] Create environment configuration in `src/lib/env.ts`

- [X] T005 Create Supabase client in `src/lib/supabase.ts`

- [X] T006 [P] Create TypeScript types in `src/types/index.ts`
  - Import types from `specs/001-ai-persona-builder/contracts/flowise-chatflow.ts`

- [X] T007 Create project directory structure
  ```
  src/
  ├── components/
  ├── lib/
  ├── hooks/
  ├── types/
  └── pages/
  supabase/
  ├── functions/
  └── migrations/
  ```

**Phase 1 Completion Criteria**:
- `pnpm dev` runs without errors
- TailwindCSS classes render correctly
- Supabase client initializes (connection test)

---

## Phase 2: Foundation

**Goal**: Set up database schema and Edge Function infrastructure (blocking for all user stories)

### Tasks

- [X] T008 Create database migration in `supabase/migrations/001_create_personas.sql`
  - Include personas table from `data-model.md`
  - Include RLS policies
  - Include updated_at trigger

- [X] T009 Apply migration via Supabase MCP
  ```sql
  -- Use mcp__supabase_flowise__apply_migration
  ```

- [X] T010 [P] Set Edge Function secrets via Supabase CLI
  ```bash
  supabase secrets set FLOWISE_API_KEY="ijD+kfSjYMcqEyBHNCHyEaymDzrD7br4BW4/DRe/eYI="
  supabase secrets set GEMINI_API_KEY="<key>"
  ```

- [X] T011 [P] Create Edge Function skeleton in `supabase/functions/personas/index.ts`
  - CORS headers
  - Auth verification
  - Method routing (GET, POST, PATCH, DELETE)

- [X] T012 [P] Create Edge Function skeleton in `supabase/functions/generate-prompt/index.ts`
  - CORS headers
  - Auth verification

- [X] T013 Create Flowise API client in `supabase/functions/_shared/flowise.ts`
  - Use types from `contracts/flowise-chatflow.ts`
  - buildCreateChatflowRequest function
  - createChatflow function
  - deleteChatflow function

- [X] T014 Generate Supabase TypeScript types
  ```bash
  supabase gen types typescript --project-id wlvfilxtvqjzwqjhfcdk > src/types/database.ts
  ```

**Phase 2 Completion Criteria**:
- `personas` table exists with RLS enabled
- Edge Functions deploy without errors
- Flowise API client can list existing chatflows

---

## Phase 3: User Story 1 - Create Persona

**Goal**: Users can create an AI persona by entering a famous person's name

**User Story**: As an end user, I want to type a famous person's name and automatically create an AI persona, so that I can quickly deploy a chatbot without manual Flowise configuration.

### Independent Test Criteria
- [ ] Enter "Albert Einstein" → persona created with status "active"
- [ ] Enter "" (empty) → validation error shown
- [ ] Enter very long name → truncated appropriately
- [ ] Flowise unavailable → clear error with retry option

### Tasks

- [X] T015 [US1] Implement prompt generation in `supabase/functions/generate-prompt/index.ts`
  - Call Gemini 2.5 Pro API
  - Use persona prompt template from `flowise-api-reference.md`
  - Return structured system prompt

- [X] T016 [US1] Implement chatflow creation in `supabase/functions/personas/index.ts` (POST handler)
  - Call generate-prompt internally
  - Build Flowise flowData using `flowise.ts` client
  - Create chatflow via Flowise API
  - Store persona in database with status tracking
  - Return created persona with API endpoint

- [X] T017 [P] [US1] Create PersonaForm component in `src/components/PersonaForm.tsx`
  - Single text input for name
  - Submit button
  - Validation (non-empty, max 100 chars)
  - Loading state during creation

- [X] T018 [P] [US1] Create useCreatePersona hook in `src/hooks/useCreatePersona.ts`
  - Call personas Edge Function
  - Handle loading/error states
  - Return mutation function and state

- [X] T019 [US1] Create main App layout in `src/App.tsx`
  - Header with app title
  - PersonaForm component
  - Conditional result display

- [X] T020 [US1] Implement error handling for persona creation
  - Network errors → retry option
  - Validation errors → inline feedback
  - Flowise errors → user-friendly message

- [X] T021 [US1] Add loading feedback in `src/components/LoadingIndicator.tsx`
  - Spinner animation
  - Progress text ("Generating prompt...", "Creating chatflow...")

- [X] T022 [US1] Wire up complete creation flow
  - Form submit → Edge Function → Success/Error display
  - Toast notifications for success/failure

**Phase 3 Completion Criteria**:
- User can enter name and create persona
- Created persona visible in Flowise dashboard
- Errors display actionable messages
- Creation completes within 30 seconds

---

## Phase 4: User Story 2 - API Endpoint Display

**Goal**: Display the generated API endpoint with copyable Python code

**User Story**: As an end user, I want to see the generated API endpoint with copyable Python code, so that I can immediately integrate the persona into my applications.

### Independent Test Criteria
- [ ] After creation → Python code snippet displayed
- [ ] Click copy button → code copied to clipboard
- [X] Toast confirms "Copied to clipboard"
- [ ] Code is syntax-highlighted

### Tasks

- [X] T023 [P] [US2] Install syntax highlighting library
  ```bash
  pnpm add prism-react-renderer
  ```

- [X] T024 [US2] Create ApiEndpointDisplay component in `src/components/ApiEndpointDisplay.tsx`
  - Display chatflow ID
  - Display full prediction URL
  - Python code snippet with syntax highlighting

- [X] T025 [P] [US2] Create CopyButton component in `src/components/CopyButton.tsx`
  - Clipboard API integration
  - Success/failure states
  - Toast notification on copy

- [X] T026 [US2] Integrate ApiEndpointDisplay after successful persona creation
  - Pass persona data from creation result
  - Animate appearance

**Phase 4 Completion Criteria**:
- Python code snippet displays after creation
- Copy button works and shows confirmation
- Code is properly syntax-highlighted

---

## Phase 5: User Story 3 - Edit Settings

**Goal**: Allow users to edit system prompt and settings after creation

**User Story**: As an end user, I want to edit the system prompt and settings after creation, so that I can fine-tune the persona's behavior.

### Independent Test Criteria
- [ ] Open settings → current system prompt displayed
- [ ] Edit prompt → save → changes persist
- [ ] Adjust temperature slider → changes reflect
- [ ] Reset button → original values restored
- [ ] Changes sync to Flowise

### Tasks

- [X] T027 [US3] Implement PATCH handler in `supabase/functions/personas/index.ts`
  - Update system prompt in database
  - Update settings in database
  - Sync changes to Flowise chatflow via API

- [X] T028 [P] [US3] Create SettingsPanel component in `src/components/SettingsPanel.tsx`
  - Editable system prompt textarea
  - Temperature slider (0-1)
  - Save and Reset buttons

- [X] T029 [P] [US3] Create useUpdatePersona hook in `src/hooks/useUpdatePersona.ts`
  - Call personas Edge Function (PATCH)
  - Handle optimistic updates
  - Rollback on error

- [X] T030 [US3] Add Flowise chatflow update in `supabase/functions/_shared/flowise.ts`
  - updateChatflow function
  - Update systemMessage in flowData

- [X] T031 [US3] Integrate SettingsPanel with persona detail view
  - Expandable/collapsible panel
  - Save confirmation toast

- [X] T032 [US3] Implement reset to defaults
  - Store original values
  - Reset handler

**Phase 5 Completion Criteria**:
- Settings panel displays current values
- Changes save to database and Flowise
- Reset restores original values
- UI provides clear feedback

---

## Phase 6: User Story 4 - Persona History

**Goal**: Display list of user's personas with management capabilities

**User Story**: As a returning user, I want to see all my previously created personas, so that I can manage, reuse, or delete them.

### Independent Test Criteria
- [ ] Page load → list of personas displayed
- [ ] Click persona → details expand
- [ ] Click delete → confirmation → persona removed
- [ ] Deleted persona removed from Flowise
- [ ] Empty state when no personas

### Tasks

- [X] T033 [US4] Implement GET handler in `supabase/functions/personas/index.ts`
  - List all user's personas (RLS enforced)
  - Filter by status (exclude deleted)
  - Pagination support

- [X] T034 [US4] Implement DELETE handler in `supabase/functions/personas/index.ts`
  - Soft delete in database (status = 'deleted')
  - Delete chatflow from Flowise

- [X] T035 [P] [US4] Create PersonaList component in `src/components/PersonaList.tsx`
  - Grid/list view of personas
  - Show name, status, creation date
  - Click to expand details

- [X] T036 [P] [US4] Create usePersonas hook in `src/hooks/usePersonas.ts`
  - Fetch user's personas
  - Handle loading/error states
  - Pagination support

- [X] T037 [US4] Create PersonaCard component in `src/components/PersonaCard.tsx`
  - Display persona summary
  - Actions: View, Edit, Delete
  - Status indicator

- [X] T038 [US4] Create DeleteConfirmation modal in `src/components/DeleteConfirmation.tsx`
  - Confirm deletion
  - Show persona name
  - Cancel/Confirm buttons

**Phase 6 Completion Criteria**:
- User sees list of all created personas
- Can view details of each persona
- Can delete personas (removes from Flowise)
- Empty state displays when no personas

---

## Phase 7: Polish & Cross-Cutting

**Goal**: Authentication, responsive design, and production readiness

### Tasks

- [X] T039 Implement Supabase Auth in `src/components/Auth.tsx`
  - Sign up / Sign in forms
  - Protected routes
  - Session persistence

- [X] T040 [P] Add responsive design to all components
  - Mobile-friendly layouts
  - Touch-friendly interactions
  - Breakpoint testing

- [X] T041 [P] Add loading skeletons in `src/components/Skeleton.tsx`
  - PersonaList skeleton
  - PersonaCard skeleton

- [X] T042 Create error boundary in `src/components/ErrorBoundary.tsx`
  - Catch React errors
  - Display friendly fallback
  - Error reporting

**Phase 7 Completion Criteria**:
- Users can sign up and sign in
- App works on mobile devices
- Graceful error handling throughout

---

## Phase 8: User Story 5 - Chat Window

**Goal**: Add a dedicated Chat section for testing conversations with created personas

**User Story**: As an end user, I want to test my created personas in a built-in chat window, so that I can verify their responses before integrating them externally.

**Prerequisites**: Phases 1-7 complete (app is functional with auth and persona CRUD)

**Clarifications Applied** (Session 2025-12-01):
- Full-page Chat section in navigation (Create / Personas / Chat)
- Session-only chat history (in-memory, cleared on page leave/refresh)
- Switching personas clears current chat
- Auto-retry up to 3 times, then show manual retry button
- "Chat" quick action on persona cards navigates to Chat with persona pre-selected

### Independent Test Criteria
- [ ] Navigate to Chat tab → persona selector displayed
- [ ] Select persona → welcome message with persona name shown
- [ ] Send message → streaming response displayed in real-time
- [ ] API failure → auto-retry 3x, then show retry button
- [ ] Switch persona → chat cleared, new welcome message
- [ ] Click "Chat" on PersonaCard → navigates to Chat with that persona selected
- [ ] No personas → prompt to create one first

### Tasks

- [X] T043 [US5] Add Chat tab to navigation in `src/App.tsx`
  - Update `Tab` type to `'create' | 'personas' | 'chat'`
  - Add third navigation button
  - Add state for `chatPersona: Persona | null`

- [X] T044 [P] [US5] Create Flowise chat client in `src/lib/flowise-chat.ts`
  - `sendMessage(chatflowId, message)` function
  - SSE streaming response parsing
  - Error handling with typed errors
  - Use types from `contracts/flowise-chatflow.ts`

- [X] T045 [P] [US5] Create ChatMessage type in `src/types/index.ts`
  - `id`, `role`, `content`, `timestamp`, `isStreaming`, `error` fields
  - Add to existing types file

- [X] T046 [US5] Create useChat hook in `src/hooks/useChat.ts`
  - Manage messages state (in-memory array)
  - `sendMessage` function with streaming support
  - Auto-retry logic (3x with exponential backoff: 1s, 2s, 4s)
  - `clearMessages` on persona switch
  - `retryLastMessage` for manual retry
  - Loading and error states

- [X] T047 [P] [US5] Create ChatMessage component in `src/components/ChatMessage.tsx`
  - User message styling (right-aligned, cosmic-cyan background)
  - Assistant message styling (left-aligned, glass background)
  - Streaming indicator (animated dots)
  - Error state with retry button
  - Timestamp display

- [X] T048 [US5] Create ChatWindow component in `src/components/ChatWindow.tsx`
  - Persona selector dropdown (shows active personas only)
  - Message list with auto-scroll to bottom
  - Input field with send button
  - Loading indicator during streaming
  - Empty states: no persona selected, no messages

- [X] T049 [P] [US5] Create PersonaSelector component in `src/components/PersonaSelector.tsx`
  - Dropdown/select with active personas
  - Current persona display with avatar
  - onChange clears chat (per clarification)

- [X] T050 [US5] Create ChatInput component in `src/components/ChatInput.tsx`
  - Text input with placeholder
  - Send button (disabled when empty or loading)
  - Enter key to send
  - Shift+Enter for newline

- [X] T051 [US5] Add "Chat" button to PersonaCard in `src/components/PersonaCard.tsx`
  - Chat icon button in actions row
  - Only show for 'active' status personas
  - onClick calls `onChat(persona)` callback

- [X] T052 [US5] Wire up Chat navigation from PersonaCard
  - Pass `onChat` callback from App.tsx
  - Handler: set `activeTab='chat'`, set `chatPersona=persona`

- [X] T053 [US5] Handle Chat empty states in `src/components/ChatWindow.tsx`
  - No personas created: "Create a persona first" with link to Create tab
  - No persona selected: "Select a persona to start chatting"
  - Empty conversation: Welcome message with persona name

- [X] T054 [US5] Add responsive design to Chat components
  - Mobile-friendly chat layout
  - Collapsible persona selector on mobile
  - Touch-friendly message input
  - Proper keyboard behavior on mobile

**Phase 8 Completion Criteria**:
- Users can navigate to Chat tab
- Users can select a persona and send messages
- Streaming responses display in real-time
- Auto-retry on failures with manual fallback
- Chat clears when switching personas
- "Chat" button on PersonaCard works correctly
- Mobile-responsive layout

---

## Parallel Execution Opportunities

### Within Phase 1 (Setup)
```
T001 (init) ──→ T002, T003, T004, T006, T007 (parallel)
                            │
                            └──→ T005 (depends on T004)
```

### Within Phase 2 (Foundation)
```
T008 ──→ T009 (sequential: migration then apply)
T010, T011, T012 (parallel: different files)
T013 (after T011, T012)
T014 (after T009)
```

### Phase 3-6 (User Stories) - Can Run in Parallel After US1
```
After Phase 3 completes:
  ├── Phase 4 (US2)  ┐
  ├── Phase 5 (US3)  ├── All parallel
  └── Phase 6 (US4)  ┘
```

### Within Phase 8 (Chat Window)
```
T043 (nav) ──┐
             ├──→ T044, T045, T047, T049 (parallel: different files)
             │           │
             │           └──→ T046 (depends on T044, T045)
             │                    │
             │                    └──→ T048 (depends on T046, T047, T049)
             │                              │
             └──────────────────────────────┼──→ T050 (parallel with T048)
                                            │
                                            ├──→ T051, T052 (after T048)
                                            │
                                            └──→ T053, T054 (after T048)
```

**Recommended Parallel Groups for Phase 8**:
1. **Group A** (start immediately): T043, T044, T045, T047, T049
2. **Group B** (after T044, T045): T046
3. **Group C** (after T046, T047, T049): T048, T050
4. **Group D** (after T048): T051, T052, T053, T054

---

## Implementation Strategy

### MVP Scope (Completed)
**Phases 1-7 are DONE** (42 tasks completed)
- Full persona CRUD functionality
- Authentication
- Settings management
- Polish and responsive design

### Next Increment: Chat Window (Phase 8)
**Complete Phase 8 (US5) - 12 tasks**
- Built-in chat interface for testing personas
- Streaming responses
- Auto-retry on failures
- Quick access from persona cards

### Estimated Effort for Phase 8
- **Parallel Group A**: ~2 hours (navigation + types + components scaffold)
- **Parallel Group B**: ~2 hours (useChat hook with streaming)
- **Parallel Group C**: ~3 hours (ChatWindow + ChatInput integration)
- **Parallel Group D**: ~2 hours (PersonaCard button + empty states + responsive)
- **Total**: ~9 hours with parallel execution

---

## Task Categories (Constitution Alignment)

| Category | Count | Tasks |
|----------|-------|-------|
| **[S]** Simplicity | 9 | T001-T007, T019, T043 |
| **[A]** API Integration | 14 | T013, T015-T016, T027, T030, T033-T034, T044, T046 |
| **[U]** UX | 22 | T017, T021-T026, T028, T035-T038, T040-T041, T047-T054 |
| **[X]** Security | 4 | T008-T010, T039 |
| **[O]** Observability | 5 | T014, T018, T020, T029, T046 |

---

## Review Notes

### Implementation Summary - 2025-11-24

**All 42 tasks completed successfully.**

#### Phase 1: Setup (T001-T007)
- Initialized React + TypeScript + Vite project
- Configured TailwindCSS v4 with PostCSS
- Created Supabase client and environment configuration
- Established project directory structure

#### Phase 2: Foundation (T008-T014)
- Applied database migration via Supabase MCP (`personas` table with RLS)
- Deployed two Edge Functions: `generate-prompt` and `personas`
- Created Flowise API client with chatflow builder functions
- Generated TypeScript types from Supabase schema

#### Phase 3: US1 - Create Persona (T015-T022)
- Implemented Gemini 2.5 Pro prompt generation
- Built complete Flowise chatflow creation pipeline
- Created PersonaForm with validation and loading states
- Added toast notifications and error handling

#### Phase 4: US2 - API Display (T023-T026)
- Installed and configured prism-react-renderer
- Created ApiEndpointDisplay with syntax-highlighted Python code
- Implemented CopyButton with clipboard API

#### Phase 5: US3 - Edit Settings (T027-T032)
- Implemented PATCH handler in personas Edge Function
- Created SettingsPanel with expandable UI
- Added temperature slider and system prompt editor
- Implemented reset functionality

#### Phase 6: US4 - Persona History (T033-T038)
- Implemented GET and DELETE handlers
- Created PersonaList, PersonaCard components
- Added DeleteConfirmation modal
- Implemented usePersonas and useDeletePersona hooks

#### Phase 7: Polish (T039-T042)
- Implemented Supabase Auth (sign up/sign in)
- Created Auth component with email/password forms
- Added loading skeletons and error boundary
- Integrated tabbed navigation and responsive design

### Key Architecture Decisions
- **Edge Functions over client-side API calls**: All Flowise/Gemini API calls routed through Supabase Edge Functions for security
- **Parallel agent execution**: Phases 4-6 executed simultaneously after US1 foundation
- **TailwindCSS v4**: Used new `@import "tailwindcss"` syntax with `@tailwindcss/postcss` plugin

### Files Created
- `src/components/`: Auth, PersonaForm, PersonaList, PersonaCard, SettingsPanel, ApiEndpointDisplay, CopyButton, LoadingIndicator, DeleteConfirmation, Skeleton, ErrorBoundary
- `src/hooks/`: useCreatePersona, usePersonas, useUpdatePersona, useDeletePersona
- `src/lib/`: supabase.ts, env.ts
- `src/types/`: index.ts, database.ts
- `supabase/functions/`: personas/index.ts, generate-prompt/index.ts, _shared/flowise.ts, _shared/cors.ts
- `supabase/migrations/`: 001_create_personas.sql

### Build Status
- TypeScript compilation: PASS
- Vite build: SUCCESS (495KB bundle, 145KB gzipped)
