<!--
# Sync Impact Report
- Version change: N/A → 1.0.0 (initial creation)
- Modified principles: N/A (initial)
- Added sections: All (Project Identity, 5 Principles, Governance)
- Removed sections: None
- Templates requiring updates:
  - .specify/templates/spec-template.md: ⚠ pending (to be created)
  - .specify/templates/plan-template.md: ⚠ pending (to be created)
  - .specify/templates/tasks-template.md: ⚠ pending (to be created)
- Follow-up TODOs: Create template files
-->

# Project Constitution

## Project Identity

**Project Name:** Flowise AI Persona Builder

**Description:** A modern web application that automatically creates AI persona chatflows
on a Render-hosted Flowise instance. Users input a famous person's name, and the system
generates a complete Flowise workflow including system prompt, Tools Agent node, memory
node, and Gemini chat model—then outputs the API endpoint and configuration settings.

**Tech Stack:**
- Frontend: React with TypeScript (modern, sleek UI)
- Backend: Supabase (database, auth, edge functions)
- Integration: Flowise API (hosted on Render)
- AI Model: Google Gemini

**Version:** 1.0.0
**Ratification Date:** 2025-11-24
**Last Amended Date:** 2025-11-24

---

## Core Principles

### Principle 1: Simplicity First

Every feature, code change, and architectural decision MUST prioritize simplicity.
Complex solutions are rejected in favor of minimal, maintainable implementations.

**Rules:**
- Each change MUST impact as little code as possible
- Features MUST be decomposed into the smallest viable units
- No premature optimization or over-engineering
- Prefer standard patterns over custom abstractions

**Rationale:** A simple codebase is easier to debug, extend, and onboard new contributors.
The Flowise integration already introduces complexity; our code MUST NOT compound it.

---

### Principle 2: API-First Integration

All Flowise interactions MUST go through well-defined API contracts. The system
treats the Flowise API as the single source of truth for chatflow creation.

**Rules:**
- All Flowise API calls MUST be centralized in a dedicated service layer
- API responses MUST be validated before processing
- Error states from Flowise MUST surface clearly to users
- API credentials MUST never appear in client-side code

**Rationale:** Consistent API handling prevents integration drift and makes debugging
Flowise-related issues straightforward.

---

### Principle 3: User Experience Excellence

The interface MUST be modern, sleek, and intuitive. Users should accomplish their
goal (creating an AI persona) with minimal friction.

**Rules:**
- The primary flow (name input → chatflow creation) MUST require 3 or fewer clicks
- Loading states MUST provide meaningful feedback
- Errors MUST be actionable and human-readable
- The output (API endpoint, system prompt, settings) MUST be easily copyable

**Rationale:** The target users want quick results. A polished UX differentiates this
tool from manual Flowise configuration.

---

### Principle 4: Security by Default

All data handling, API communications, and user inputs MUST follow security best
practices without requiring explicit opt-in.

**Rules:**
- Supabase Row Level Security (RLS) MUST be enabled for all tables
- All API keys MUST be stored in environment variables or Supabase secrets
- User inputs MUST be sanitized before use in prompts or API calls
- HTTPS MUST be enforced for all external communications

**Rationale:** AI persona creation involves API keys and user data. Security failures
would compromise the Flowise instance and user trust.

---

### Principle 5: Observable Operations

The system MUST provide visibility into chatflow creation status, errors, and
historical operations.

**Rules:**
- All Flowise API operations MUST be logged with timestamps
- Failed operations MUST store error details for debugging
- Users MUST be able to view their created personas and their status
- Supabase audit logs SHOULD be enabled for sensitive operations

**Rationale:** Debugging Flowise integration issues requires operation history.
Users need confidence their personas were created successfully.

---

## Governance

### Amendment Procedure

1. Propose changes via a dedicated PR or discussion
2. Changes to principles require explicit justification
3. Version MUST be incremented according to semantic versioning:
   - MAJOR: Principle removal or fundamental redefinition
   - MINOR: New principle added or significant expansion
   - PATCH: Clarifications, wording improvements

### Compliance Review

- All PRs MUST be reviewed against active principles
- Principle violations MUST be resolved before merge
- Quarterly reviews SHOULD assess principle relevance

### Version History

| Version | Date       | Summary                              |
|---------|------------|--------------------------------------|
| 1.0.0   | 2025-11-24 | Initial constitution ratification    |
