# Feature Specification: AI Persona Builder

## Overview

**Feature:** Automatic AI Persona Chatflow Generator for Flowise
**Priority:** High
**Estimated Effort:** L (Large)

Users enter the name of a famous person, and the system automatically creates a
complete AI persona chatflow on a Render-hosted Flowise instance. The created
chatflow includes a Tool Agent with memory and Gemini chat model, outputting
the API endpoint and configuration for immediate use or further customization.

## Clarifications

### Session 2025-12-01

- Q: Where should the chat window appear in the interface? → A: Full-page chat section in navigation (Create / Personas / Chat)
- Q: Should chat history persist across browser sessions? → A: Session only (in-memory, cleared on page leave/refresh)
- Q: When switching personas mid-conversation, what happens to current chat? → A: Clear chat and start fresh with new persona
- Q: How should UI handle Flowise API failures during chat? → A: Auto-retry up to 3 times, then show error with retry button
- Q: How can users access Chat for a specific persona? → A: Both Chat nav section AND "Chat" quick action button on each persona card

## Constitution Alignment

This feature aligns with the following principles:

- [x] **Simplicity First**: Single input field creates complete chatflow; minimal
  user decisions required
- [x] **API-First Integration**: All Flowise operations via centralized service;
  API responses validated before display
- [x] **User Experience Excellence**: 3-click flow (enter name, create, copy endpoint);
  modern sleek interface
- [x] **Security by Default**: Flowise API keys stored server-side in Supabase;
  user inputs sanitized before prompt generation
- [x] **Observable Operations**: All chatflow creations logged with timestamps;
  users can view history of created personas

---

## User Scenarios & Testing

### Primary Scenario: Create AI Persona

**Actor:** End user wanting to create an AI persona chatbot

**Flow:**
1. User opens the application
2. User types a famous person's name (e.g., "Albert Einstein")
3. User clicks "Create Persona"
4. System displays loading indicator with progress feedback
5. System generates appropriate system prompt for the persona
6. System creates Flowise chatflow via API
7. System displays success with:
   - Python API endpoint code (copyable)
   - Generated system prompt (editable)
   - Agent settings panel (optional modifications)
8. User copies endpoint or adjusts settings

**Acceptance Scenarios:**
- Valid famous person name creates chatflow successfully
- Invalid/unknown name shows helpful error message
- Network failure displays retry option
- Duplicate persona name handled gracefully (auto-increment naming)

### Secondary Scenario: View Created Personas

**Actor:** Returning user

**Flow:**
1. User opens application (authenticated via Supabase)
2. User sees list of previously created personas
3. User can view details, copy endpoint, or delete persona

### Tertiary Scenario: Test Persona via Chat

**Actor:** End user wanting to test a created persona

**Flow:**
1. User navigates to Chat section (or clicks "Chat" on a persona card)
2. User selects a persona from the dropdown (or persona is pre-selected from card click)
3. User types a message and sends it
4. System displays loading indicator while waiting for response
5. System streams the persona's response in real-time
6. User continues conversation to verify persona behavior
7. User can switch to a different persona (clears chat and starts fresh)

**Acceptance Scenarios:**
- Message sent successfully shows streamed response
- API failure auto-retries up to 3 times before showing error with retry button
- Switching personas clears current conversation
- No persona selected shows prompt to select one

### Edge Cases

- Empty name input: Validation prevents submission
- Very long names: Truncated appropriately for Flowise chatflow name
- Special characters in name: Sanitized for safe use
- Flowise API unavailable: Clear error with retry option
- Rate limiting: Graceful handling with user feedback

---

## Functional Requirements

### FR-1: Persona Name Input

The system MUST provide a text input field for entering the famous person's name.

**Acceptance Criteria:**
- Input field is prominently displayed on the main screen
- Input validates non-empty value before submission
- Input sanitizes special characters that could cause issues
- Input provides auto-complete suggestions for common names (optional enhancement)

### FR-2: System Prompt Generation

The system MUST generate an appropriate system prompt that instructs the AI to
roleplay as the specified famous person.

**Acceptance Criteria:**
- Generated prompt includes the person's name
- Prompt instructs the AI to adopt the persona's speaking style and knowledge
- Prompt is displayed to the user for review/editing before or after creation
- Prompt can be modified after initial generation
- Prompt generation uses Gemini 2.5 Pro for high-quality persona research and writing

**Model Configuration:**
- **Prompt Generation**: Gemini 2.5 Pro (gemini-2.5-pro) - used to research the
  famous person and craft a detailed, accurate system prompt
- **Agent Runtime**: Gemini 2.5 Flash (gemini-2.5-flash) - used in the Flowise
  chatflow for fast, cost-effective conversations

**Assumptions:**
- System uses Gemini 2.5 Pro to generate rich, contextual system prompts
- Generated prompt includes persona background, speaking style, knowledge areas,
  and behavioral guidelines

### FR-3: Flowise Chatflow Creation

The system MUST create a complete chatflow on the Flowise instance via API.

**Acceptance Criteria:**
- Chatflow is created with the persona's name as the flow name
- Chatflow includes these connected nodes:
  - ChatGoogleGenerativeAI (Gemini model) as the chat model
  - Buffer Memory node for conversation history
  - Tool Agent node with the generated system prompt
- Chatflow is deployed and ready for API access immediately
- Creation completes within 30 seconds under normal conditions

**Flowise Node Configuration (verified from existing chatflows):**
- **Tool Agent** (AgentExecutor): Connected to memory, chat model, and custom tool
  - `systemMessage`: Generated persona prompt
  - `tools`: PerplexityWideSearch for web search capability
- **Memory**: Upstash Redis-Backed Chat Memory
  - Credential ID: `b88f589c-e0fd-4a2e-a353-0db6b491ac8e`
  - baseURL: `https://obliging-zebra-56633.upstash.io`
- **Chat Model**: ChatGoogleGenerativeAI with **Gemini 2.5 Flash**
  - Credential ID: `f4e4f034-d71a-4039-b339-8dea1429fa06` (lasha3101@gmail.com)
  - Model: `gemini-2.5-flash` for fast agent responses
- **Custom Tool**: PerplexityWideSearch
  - Tool ID: `f4e953b6-8f59-4969-820d-946d00c3456d`
  - Provides web search capability for up-to-date information

### FR-4: API Endpoint Display

The system MUST display the generated API endpoint after successful creation.

**Acceptance Criteria:**
- Python code snippet displayed with the prediction endpoint URL
- Code is syntax-highlighted for readability
- One-click copy button for the entire code snippet
- Endpoint format: `https://{flowise-host}/api/v1/prediction/{chatflow-id}`

### FR-5: Settings Panel

The system MUST provide a settings panel for viewing and modifying agent configuration.

**Acceptance Criteria:**
- System prompt is editable after creation
- Temperature setting is adjustable (0.0 - 1.0 range)
- Changes can be saved back to Flowise via API
- Reset to defaults option available

### FR-6: Persona History

The system MUST maintain a history of created personas for authenticated users.

**Acceptance Criteria:**
- List view shows all personas created by the user
- Each entry displays: persona name, creation date, API endpoint
- Users can delete personas (removes from Flowise and database)
- Pagination for users with many personas

### FR-7: Chat Window

The system MUST provide a dedicated Chat section in the main navigation (alongside Create and Personas) for testing conversations with created agents.

**Acceptance Criteria:**
- Chat section accessible via main navigation as a full-page view
- User can select any active persona from a dropdown/list before chatting
- Chat interface displays conversation messages in a standard chat format
- Messages sent to the selected persona's Flowise prediction endpoint
- Real-time streaming responses displayed as they arrive
- Conversation history visible within the current session (in-memory only, cleared on page leave/refresh)
- Switching personas clears the current chat and starts a fresh conversation
- On API failure: auto-retry up to 3 times, then show error message with manual retry button
- "Chat" quick action button on each persona card navigates to Chat section with that persona pre-selected

---

## Non-Functional Requirements

### NFR-1: Performance

- Chatflow creation completes within 30 seconds
- UI remains responsive during API operations
- Page load time under 3 seconds

### NFR-2: Security

- Flowise API key stored only in Supabase secrets/environment
- All API calls made server-side (Supabase Edge Functions)
- User inputs sanitized before inclusion in prompts or API calls
- Supabase Row Level Security enabled on all tables

### NFR-3: Reliability

- Failed operations logged with error details
- Retry mechanism for transient failures
- Graceful degradation when Flowise is unavailable

### NFR-4: Usability

- Interface works on desktop and mobile devices
- Clear feedback during all operations
- Error messages are actionable and human-readable

---

## User Stories

```
As an end user,
I want to type a famous person's name and automatically create an AI persona,
So that I can quickly deploy a chatbot without manual Flowise configuration.

As an end user,
I want to see the generated API endpoint with copyable Python code,
So that I can immediately integrate the persona into my applications.

As an end user,
I want to edit the system prompt and settings after creation,
So that I can fine-tune the persona's behavior.

As a returning user,
I want to see all my previously created personas,
So that I can manage, reuse, or delete them.

As an end user,
I want to test my created personas in a built-in chat window,
So that I can verify their responses before integrating them externally.
```

---

## Success Criteria

1. **Task Completion Rate**: 90% of users successfully create a persona on first attempt
2. **Time to Value**: Users can create and receive an API endpoint within 2 minutes
3. **Error Recovery**: 80% of failed operations succeed on retry
4. **User Satisfaction**: Interface rated "easy to use" by 85% of users
5. **System Availability**: Chatflow creation succeeds 99% of the time when Flowise is available

---

## Key Entities

### Persona

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Reference to authenticated user |
| name | Famous person's name |
| chatflow_id | Flowise chatflow identifier |
| system_prompt | Generated/customized system prompt |
| api_endpoint | Full prediction API URL |
| settings | JSON object with temperature, etc. |
| created_at | Timestamp of creation |
| updated_at | Timestamp of last modification |

### User (Supabase Auth)

Standard Supabase authentication user.

---

## Assumptions

1. User has access to a Render-hosted Flowise instance with valid API credentials
2. Flowise instance has ChatGoogleGenerativeAI and Tool Agent nodes available
3. Gemini API credentials are pre-configured in Flowise
4. Users will primarily access via web browser on desktop
5. Famous person prompt template provides acceptable baseline behavior
6. Supabase project is set up with authentication enabled

---

## Out of Scope

- Custom tool integration (beyond default Tool Agent)
- Multiple AI model selection (Gemini only for MVP)
- Collaborative features (sharing personas between users)
- Chatbot embedding/widget generation
- Persistent conversation history export (session-only chat history is in scope)
- Billing or usage metering
- Mobile native applications

---

## Dependencies

- Flowise instance hosted on Render with API access enabled
- Supabase project for backend (database, auth, edge functions)
- Supabase MCP for all database operations
- Google Gemini API credentials configured in Flowise
- Valid Flowise API key with chatflow creation permissions

## API Configuration

| Service | Model/Key | Purpose |
|---------|-----------|---------|
| Gemini API | gemini-2.5-pro | System prompt generation (high quality) |
| Gemini API | gemini-2.5-flash | Flowise agent runtime (fast responses) |
| Supabase | Via MCP | All database operations |
| Flowise | Instance API | Chatflow creation and management |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flowise API changes | High | Version pin API calls; monitor Flowise releases |
| Gemini rate limiting | Medium | Implement backoff; show clear user feedback |
| Prompt injection via names | Medium | Sanitize inputs; use parameterized prompts |
| Flowise instance downtime | High | Health check endpoint; clear error messaging |
