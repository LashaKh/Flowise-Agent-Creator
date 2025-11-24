# Quickstart: AI Persona Builder

## Prerequisites

Before starting development, ensure you have:

- [ ] Node.js 18+ installed
- [ ] pnpm installed (`npm install -g pnpm`)
- [ ] Supabase CLI installed (`brew install supabase/tap/supabase`)
- [ ] Access to the Supabase project (MediMindAI's Project)
- [ ] Git configured with access to this repository

## Environment Setup

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd Flowise_Agent_Builder

# Install dependencies
pnpm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://wlvfilxtvqjzwqjhfcdk.supabase.co
VITE_SUPABASE_ANON_KEY=<get-from-supabase-dashboard>

# These are for Edge Functions only (not exposed to client)
# Set via: supabase secrets set FLOWISE_API_KEY=<value>
```

### 3. Link to Supabase Project

```bash
# Login to Supabase
supabase login

# Link to the project
supabase link --project-ref wlvfilxtvqjzwqjhfcdk
```

### 4. Set Edge Function Secrets

```bash
# Flowise API Key
supabase secrets set FLOWISE_API_KEY="ijD+kfSjYMcqEyBHNCHyEaymDzrD7br4BW4/DRe/eYI="

# Gemini API Key (for prompt generation)
supabase secrets set GEMINI_API_KEY="<your-gemini-api-key>"
```

## Database Setup

### Apply Migrations

```bash
# Pull existing schema (if any)
supabase db pull

# Apply new migrations
supabase db push
```

### Verify Tables

```sql
-- Run in Supabase SQL Editor or via MCP
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';
```

Expected tables:
- `personas`

## Development Workflow

### Start Local Development Server

```bash
# Start React app
pnpm dev
```

App available at: http://localhost:5173

### Start Supabase Edge Functions Locally

```bash
# In a separate terminal
supabase functions serve
```

Functions available at: http://localhost:54321/functions/v1

### Test Edge Functions

```bash
# Test persona creation
curl -X POST http://localhost:54321/functions/v1/personas \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Albert Einstein"}'
```

## Project Structure

```
Flowise_Agent_Builder/
├── src/
│   ├── components/       # React components
│   │   ├── PersonaForm.tsx
│   │   ├── PersonaList.tsx
│   │   ├── ApiEndpointDisplay.tsx
│   │   └── SettingsPanel.tsx
│   ├── lib/
│   │   ├── supabase.ts   # Supabase client
│   │   └── api.ts        # API helper functions
│   ├── hooks/
│   │   └── usePersonas.ts
│   ├── types/
│   │   └── index.ts      # TypeScript types
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   ├── functions/
│   │   ├── personas/     # CRUD operations
│   │   └── generate-prompt/
│   └── migrations/
│       └── 001_create_personas.sql
├── specs/                # Design documents (you are here)
├── public/
└── package.json
```

## Key Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript compiler check |
| `supabase functions serve` | Run Edge Functions locally |
| `supabase db push` | Apply migrations |
| `supabase gen types typescript` | Generate TypeScript types |

## Flowise API Testing

### List Existing Chatflows

```bash
curl -X GET "https://flowise-2-0.onrender.com/api/v1/chatflows" \
  -H "Authorization: Bearer ijD+kfSjYMcqEyBHNCHyEaymDzrD7br4BW4/DRe/eYI="
```

### Test Chatflow Creation

```bash
# Use the reference flowdata to test
curl -X POST "https://flowise-2-0.onrender.com/api/v1/chatflows" \
  -H "Authorization: Bearer ijD+kfSjYMcqEyBHNCHyEaymDzrD7br4BW4/DRe/eYI=" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Persona",
    "flowData": "<stringified-flow-data>",
    "deployed": true,
    "isPublic": false,
    "type": "CHATFLOW"
  }'
```

## Troubleshooting

### Common Issues

**Supabase connection fails**
- Verify `.env.local` has correct URL and anon key
- Check if project is paused in Supabase dashboard

**Edge Function returns 401**
- Ensure JWT token is valid (not expired)
- Check if user is authenticated

**Flowise API returns error**
- Verify API key is correct
- Check if Flowise instance is running (Render may sleep after inactivity)

**Database migration fails**
- Run `supabase db reset` to start fresh (WARNING: deletes data)
- Check migration SQL for syntax errors

### Useful Debug Commands

```bash
# Check Supabase project status
supabase status

# View Edge Function logs
supabase functions logs personas

# Test database connection
supabase db lint
```

## Next Steps

1. Review the [spec.md](./spec.md) for full requirements
2. Review the [data-model.md](./data-model.md) for schema details
3. Review the [contracts/openapi.yaml](./contracts/openapi.yaml) for API specs
4. Start with Phase 1 tasks in [plan.md](./plan.md)
