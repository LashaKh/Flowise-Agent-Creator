-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Personas table
CREATE TABLE IF NOT EXISTS public.personas (
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
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON public.personas(user_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_personas_status ON public.personas(status);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS personas_updated_at ON public.personas;
CREATE TRIGGER personas_updated_at
  BEFORE UPDATE ON public.personas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable RLS
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own personas
DROP POLICY IF EXISTS "Users can view own personas" ON public.personas;
CREATE POLICY "Users can view own personas"
  ON public.personas
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own personas
DROP POLICY IF EXISTS "Users can create own personas" ON public.personas;
CREATE POLICY "Users can create own personas"
  ON public.personas
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own personas
DROP POLICY IF EXISTS "Users can update own personas" ON public.personas;
CREATE POLICY "Users can update own personas"
  ON public.personas
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own personas
DROP POLICY IF EXISTS "Users can delete own personas" ON public.personas;
CREATE POLICY "Users can delete own personas"
  ON public.personas
  FOR DELETE
  USING (auth.uid() = user_id);
