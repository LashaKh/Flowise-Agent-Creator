# Implementation Plan: AI Persona Builder

## Constitution Check

Before implementation, verify alignment with core principles:

| Principle | Compliant | Notes |
|-----------|-----------|-------|
| Simplicity First | [x] | Single input creates complete chatflow; minimal components; template-based Flowise data |
| API-First Integration | [x] | All Flowise calls via Edge Functions; centralized in `flowise-chatflow.ts`; validated responses |
| User Experience Excellence | [x] | 3-click flow; loading feedback; copyable Python snippet; actionable errors |
| Security by Default | [x] | RLS enabled; API keys in Edge Function secrets only; input sanitization |
| Observable Operations | [x] | Status tracking in DB; error messages stored; persona history viewable |

---

## Prerequisites

- [x] Supabase project created (MediMindAI's Project - `wlvfilxtvqjzwqjhfcdk`)
- [x] Flowise instance running (https://flowise-2-0.onrender.com)
- [x] Flowise API credentials verified
- [x] Reference chatflow structure documented
- [ ] React + Vite project initialized
- [ ] Supabase CLI linked to project

---

## Implementation Phases

### Phase 1: Foundation Setup

**Goal:** Set up project structure, database schema, and Supabase Edge Functions skeleton

**Tasks:**

1. [ ] Initialize React + TypeScript + Vite project
   - `pnpm create vite@latest . --template react-ts`
   - Install dependencies: `@supabase/supabase-js`, `tailwindcss`, `react-hot-toast`

2. [ ] Configure TailwindCSS
   - Initialize Tailwind: `pnpm add -D tailwindcss postcss autoprefixer`
   - Create `tailwind.config.js` with custom theme

3. [ ] Create Supabase client configuration
   - `src/lib/supabase.ts` with typed client
   - Environment variables setup

4. [ ] Apply database migration
   - Create `supabase/migrations/001_create_personas.sql`
   - Apply via `supabase db push`
   - Verify RLS policies

5. [ ] Create Edge Function skeletons
   - `supabase/functions/personas/index.ts` (CRUD)
   - `supabase/functions/generate-prompt/index.ts`
   - Set secrets: `FLOWISE_API_KEY`, `GEMINI_API_KEY`

**Deliverables:**
- Working React app with Supabase connection
- `personas` table with RLS
- Edge Function stubs deployable

---

### Phase 2: Core Persona Creation Flow

**Goal:** Implement the primary user journey: name input -> chatflow creation -> endpoint display

**Tasks:**

1. [ ] Implement `generate-prompt` Edge Function
   - Call Gemini 2.5 Pro with persona template
   - Return structured system prompt
   - Handle errors gracefully

2. [ ] Implement Flowise chatflow builder
   - Use `contracts/flowise-chatflow.ts` types
   - `buildCreateChatflowRequest()` function
   - Test with manual API calls first

3. [ ] Implement `personas` Edge Function (POST)
   - Generate prompt via Gemini
   - Create Flowise chatflow
   - Store persona in database
   - Return created persona with endpoint

4. [ ] Create PersonaForm component
   - Single text input for name
   - Submit button with loading state
   - Validation (non-empty, max length)

5. [ ] Create ApiEndpointDisplay component
   - Python code snippet with syntax highlighting
   - Copy button with toast feedback
   - Display chatflow details

6. [ ] Wire up the creation flow
   - Form submission -> Edge Function -> Display result
   - Loading states throughout
   - Error handling with retry

**Deliverables:**
- Users can create a persona by entering a name
- System prompt is generated via Gemini
- Flowise chatflow is created and deployed
- API endpoint is displayed with copyable Python code

---

### Phase 3: Persona Management

**Goal:** Allow users to view, edit, and delete their created personas

**Tasks:**

1. [ ] Implement `personas` Edge Function (GET, PATCH, DELETE)
   - List all user's personas
   - Get single persona details
   - Update system prompt and settings
   - Soft delete (update status)

2. [ ] Create PersonaList component
   - Grid/list view of personas
   - Show name, status, creation date
   - Click to view details

3. [ ] Create SettingsPanel component
   - Edit system prompt (textarea)
   - Temperature slider (0-1)
   - Save and Reset buttons

4. [ ] Implement persona deletion
   - Confirmation modal
   - Delete from Flowise via API
   - Update database status

5. [ ] Add pagination for persona list
   - Limit 20 per page
   - Previous/Next navigation

**Deliverables:**
- Users see list of their personas
- Users can view/edit persona settings
- Users can delete personas
- Settings sync back to Flowise

---

### Phase 4: Authentication & Polish

**Goal:** Add user authentication and polish the UI/UX

**Tasks:**

1. [ ] Implement Supabase Auth
   - Sign up / Sign in pages
   - Protected routes
   - Session management

2. [ ] Add loading skeletons
   - PersonaList loading state
   - Form submission feedback

3. [ ] Implement error boundary
   - Catch React errors
   - Display friendly fallback

4. [ ] Add responsive design
   - Mobile-friendly layouts
   - Touch-friendly interactions

5. [ ] Performance optimization
   - Code splitting
   - Image optimization
   - Caching strategies

**Deliverables:**
- Full authentication flow
- Polished, responsive UI
- Production-ready application

---

## Testing Strategy

### Unit Tests
- [ ] Flowise chatflow builder functions
- [ ] Input validation utilities
- [ ] API response transformers

### Integration Tests
- [ ] Edge Function endpoints (via Supabase test utilities)
- [ ] Database operations with RLS
- [ ] Flowise API integration

### E2E Tests
- [ ] Complete persona creation flow
- [ ] Edit and delete flows
- [ ] Authentication flow

---

## Rollback Plan

If critical issues arise:

1. **Database rollback**: Use Supabase point-in-time recovery
2. **Edge Function rollback**: Redeploy previous version via Git history
3. **Flowise cleanup**: Manual deletion of orphaned chatflows via API
4. **Frontend rollback**: Revert to previous deployment

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Persona creation success rate | 90% | `status = 'active'` / total attempts |
| Time to first endpoint | < 30 seconds | Creation timestamp to ready |
| UI responsiveness | < 3 second load | Lighthouse performance score |
| Error recovery | 80% succeed on retry | Retry success / retry attempts |

---

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| React | ^18 | UI framework |
| TypeScript | ^5 | Type safety |
| Vite | ^5 | Build tool |
| @supabase/supabase-js | ^2 | Database client |
| TailwindCSS | ^3 | Styling |
| react-hot-toast | ^2 | Notifications |
| prism-react-renderer | ^2 | Code highlighting |

---

## Phase 2 Planning Complete

**Branch:** `1-ai-persona-builder`

**Artifacts Generated:**
- `specs/001-ai-persona-builder/research.md` - Technology decisions
- `specs/001-ai-persona-builder/data-model.md` - Database schema
- `specs/001-ai-persona-builder/contracts/openapi.yaml` - API specification
- `specs/001-ai-persona-builder/contracts/flowise-chatflow.ts` - Flowise types
- `specs/001-ai-persona-builder/quickstart.md` - Development setup
- `specs/001-ai-persona-builder/plan.md` - This implementation plan

**Next Steps:**
1. Run `/speckit.tasks` to generate actionable task list
2. Begin Phase 1 implementation
