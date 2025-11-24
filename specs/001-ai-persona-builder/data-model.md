# Data Model: AI Persona Builder

## Entity Relationship Diagram

```
┌──────────────────┐         ┌──────────────────┐
│   auth.users     │         │     personas     │
│   (Supabase)     │         │                  │
├──────────────────┤         ├──────────────────┤
│ id (UUID) PK     │─────────│ user_id (UUID) FK│
│ email            │    1:N  │ id (UUID) PK     │
│ created_at       │         │ name             │
│ ...              │         │ chatflow_id      │
└──────────────────┘         │ system_prompt    │
                             │ api_endpoint     │
                             │ settings (JSONB) │
                             │ status           │
                             │ created_at       │
                             │ updated_at       │
                             └──────────────────┘
```

---

## Entity: Persona

### Description
Represents an AI persona chatflow created by a user. Each persona corresponds to a Flowise chatflow that roleplays as a specific famous person.

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, NOT NULL, DEFAULT gen_random_uuid() | Unique identifier |
| `user_id` | UUID | FK → auth.users, NOT NULL | Owner of the persona |
| `name` | TEXT | NOT NULL, max 100 chars | Famous person's name (e.g., "Albert Einstein") |
| `chatflow_id` | TEXT | NOT NULL, UNIQUE | Flowise chatflow identifier returned from API |
| `system_prompt` | TEXT | NOT NULL | Generated/customized system prompt for the persona |
| `api_endpoint` | TEXT | NOT NULL | Full prediction API URL for the chatflow |
| `settings` | JSONB | DEFAULT '{}' | Configurable settings (temperature, etc.) |
| `status` | TEXT | DEFAULT 'active', CHECK | Persona status: 'active', 'creating', 'failed', 'deleted' |
| `error_message` | TEXT | NULLABLE | Error details if status is 'failed' |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Last modification timestamp |

### Settings JSONB Structure

```typescript
interface PersonaSettings {
  temperature?: number;      // 0.0 - 1.0, default 0.7
  modelName?: string;        // Currently fixed to "gemini-2.5-flash"
  customInstructions?: string; // Additional user-provided instructions
}
```

### State Transitions

```
┌──────────┐     success     ┌──────────┐
│ creating │────────────────→│  active  │
└──────────┘                 └──────────┘
     │                            │
     │ failure                    │ delete
     ▼                            ▼
┌──────────┐                 ┌──────────┐
│  failed  │                 │ deleted  │
└──────────┘                 └──────────┘
```

---

## SQL Schema

```sql
-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Personas table
CREATE TABLE public.personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 100),
  chatflow_id TEXT NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  api_endpoint TEXT NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('creating', 'active', 'failed', 'deleted')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for user lookups (most common query pattern)
CREATE INDEX idx_personas_user_id ON public.personas(user_id);

-- Index for status filtering
CREATE INDEX idx_personas_status ON public.personas(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personas_updated_at
  BEFORE UPDATE ON public.personas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

---

## Row Level Security (RLS) Policies

```sql
-- Enable RLS
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own personas
CREATE POLICY "Users can view own personas"
  ON public.personas
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own personas
CREATE POLICY "Users can create own personas"
  ON public.personas
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own personas
CREATE POLICY "Users can update own personas"
  ON public.personas
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own personas
CREATE POLICY "Users can delete own personas"
  ON public.personas
  FOR DELETE
  USING (auth.uid() = user_id);
```

---

## TypeScript Types

```typescript
// Database row type (matches Supabase generated types)
export interface PersonaRow {
  id: string;
  user_id: string;
  name: string;
  chatflow_id: string;
  system_prompt: string;
  api_endpoint: string;
  settings: PersonaSettings;
  status: 'creating' | 'active' | 'failed' | 'deleted';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// Settings stored in JSONB
export interface PersonaSettings {
  temperature?: number;
  modelName?: string;
  customInstructions?: string;
}

// API response type for frontend
export interface Persona {
  id: string;
  name: string;
  chatflowId: string;
  systemPrompt: string;
  apiEndpoint: string;
  settings: PersonaSettings;
  status: PersonaRow['status'];
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Create persona request
export interface CreatePersonaRequest {
  name: string;
}

// Update persona request
export interface UpdatePersonaRequest {
  systemPrompt?: string;
  settings?: Partial<PersonaSettings>;
}
```

---

## Validation Rules

### Name Field
- Required, non-empty
- Maximum 100 characters
- Trimmed of leading/trailing whitespace
- Sanitized for special characters that could cause issues in Flowise flow names

### System Prompt Field
- Required, non-empty
- No maximum length (Flowise handles any length)
- UTF-8 encoded

### Settings Field
- `temperature`: Number between 0.0 and 1.0
- `modelName`: Must be valid Gemini model identifier
- `customInstructions`: Optional string, max 2000 characters

---

## Query Patterns

### Get all personas for a user
```sql
SELECT * FROM personas
WHERE user_id = $1
  AND status != 'deleted'
ORDER BY created_at DESC;
```

### Get single persona
```sql
SELECT * FROM personas
WHERE id = $1
  AND user_id = $2;
```

### Check for duplicate name
```sql
SELECT COUNT(*) FROM personas
WHERE user_id = $1
  AND name ILIKE $2
  AND status != 'deleted';
```

### Soft delete persona
```sql
UPDATE personas
SET status = 'deleted', updated_at = now()
WHERE id = $1 AND user_id = $2;
```
