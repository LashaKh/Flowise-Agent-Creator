import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handleCors, corsHeadersFor } from '../_shared/cors.ts';
import { createChatflow, deleteChatflow, updateChatflow, buildPredictionEndpoint } from '../_shared/flowise.ts';
// Unused-import guard: corsHeaders is re-exported for compat; keep the binding.
void corsHeaders;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface PersonaSettings {
  temperature?: number;
  modelName?: string;
  customInstructions?: string;
}

interface PermissionFields {
  enabledTools?: string[];
  allowedPaths?: Array<{ path: string; mode: 'read' | 'readwrite' }>;
  confirmationLevel?: string;
  dangerousToolsEnabled?: boolean;
  activityLogging?: boolean;
  undoEnabled?: boolean;
  sandboxEnabled?: boolean;
}

interface CreatePersonaRequest {
  name: string;
  permissions?: PermissionFields;
}

interface UpdatePersonaRequest {
  systemPrompt?: string;
  settings?: Partial<PersonaSettings>;
  permissions?: Partial<PermissionFields>;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Audit finding P3-F-2: use the anon key + user's JWT so Row-Level
    // Security actually enforces access. Verified RLS policies exist on
    // `personas` table checking `auth.uid() = user_id` for all 4 operations.
    //
    // Previously we used SUPABASE_SERVICE_ROLE_KEY which bypassed RLS
    // entirely and relied on manual `.eq('user_id', ...)` filters. A single
    // forgotten filter would have been a cross-user data leak.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user from auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const personaId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // Route by method
    switch (req.method) {
      case 'GET':
        return await handleGet(supabase, user.id, personaId);
      case 'POST':
        return await handlePost(supabase, user.id, await req.json());
      case 'PATCH':
        if (!personaId) {
          return new Response(
            JSON.stringify({ error: 'Persona ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handlePatch(supabase, user.id, personaId, await req.json());
      case 'DELETE':
        if (!personaId) {
          return new Response(
            JSON.stringify({ error: 'Persona ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleDelete(supabase, user.id, personaId);
      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('Error in personas function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// GET - List personas or get single persona
async function handleGet(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  personaId: string | null
): Promise<Response> {
  if (personaId) {
    // Get single persona
    const { data, error } = await supabase
      .from('personas')
      .select('*')
      .eq('id', personaId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: 'Persona not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // List all personas (exclude deleted)
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch personas' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// POST - Create new persona
async function handlePost(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: CreatePersonaRequest
): Promise<Response> {
  const { name } = body;

  // Validate name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Name is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (name.length > 100) {
    return new Response(
      JSON.stringify({ error: 'Name must be 100 characters or less' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const trimmedName = name.trim();
  const permissions = body.permissions;

  // Build insert data.
  //
  // Permissions are stored INSIDE the `settings` JSONB column because the
  // personas table does not have dedicated permission columns. Earlier code
  // was setting fields like `enabled_tools` directly on the row — Postgres
  // silently dropped them on insert and user permission choices were lost
  // (audit finding P2-4). All permission fields now round-trip via settings.
  const insertData: Record<string, unknown> = {
    user_id: userId,
    name: trimmedName,
    chatflow_id: 'pending',
    system_prompt: 'pending',
    api_endpoint: 'pending',
    status: 'creating',
  };

  if (permissions) {
    insertData.settings = {
      permissions: {
        enabledTools: permissions.enabledTools,
        allowedPaths: permissions.allowedPaths,
        confirmationLevel: permissions.confirmationLevel,
        dangerousToolsEnabled: permissions.dangerousToolsEnabled,
        activityLogging: permissions.activityLogging,
        undoEnabled: permissions.undoEnabled,
        sandboxEnabled: permissions.sandboxEnabled,
      },
    };
  }

  // Create persona record with 'creating' status
  const { data: persona, error: insertError } = await supabase
    .from('personas')
    .insert(insertData)
    .select()
    .single();

  if (insertError) {
    console.error('Failed to insert persona:', insertError);
    return new Response(
      JSON.stringify({ error: 'Failed to create persona' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Generate system prompt using Gemini
    const generatePromptResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-prompt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ name: trimmedName }),
      }
    );

    if (!generatePromptResponse.ok) {
      throw new Error('Failed to generate prompt');
    }

    const { systemPrompt } = await generatePromptResponse.json();

    // Create Flowise chatflow
    const chatflow = await createChatflow(trimmedName, systemPrompt);
    const apiEndpoint = buildPredictionEndpoint(chatflow.id);

    // Update persona with chatflow details
    const { data: updatedPersona, error: updateError } = await supabase
      .from('personas')
      .update({
        chatflow_id: chatflow.id,
        system_prompt: systemPrompt,
        api_endpoint: apiEndpoint,
        status: 'active',
      })
      .eq('id', persona.id)
      .select()
      .single();

    if (updateError) {
      // Try to clean up the chatflow
      try {
        await deleteChatflow(chatflow.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup chatflow:', cleanupError);
      }
      throw new Error('Failed to update persona');
    }

    return new Response(
      JSON.stringify({ data: updatedPersona }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating persona:', error);

    // Update persona status to failed
    await supabase
      .from('personas')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', persona.id);

    return new Response(
      JSON.stringify({ error: 'Failed to create persona', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// PATCH - Update persona
async function handlePatch(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  personaId: string,
  body: UpdatePersonaRequest
): Promise<Response> {
  // Get current persona
  const { data: currentPersona, error: fetchError } = await supabase
    .from('personas')
    .select('*')
    .eq('id', personaId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !currentPersona) {
    return new Response(
      JSON.stringify({ error: 'Persona not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const updates: Record<string, unknown> = {};

  if (body.systemPrompt !== undefined) {
    updates.system_prompt = body.systemPrompt;
  }

  // Merge settings (and permissions which live inside settings — audit P2-4).
  const mergedSettings: Record<string, unknown> = {
    ...(currentPersona.settings ?? {}),
    ...(body.settings ?? {}),
  };
  if (body.permissions) {
    mergedSettings.permissions = {
      ...((currentPersona.settings as Record<string, unknown>)?.permissions as Record<string, unknown> ?? {}),
      ...body.permissions,
    };
  }
  if (body.settings !== undefined || body.permissions !== undefined) {
    updates.settings = mergedSettings;
  }

  // Audit finding P3-F-1: update the database FIRST, then Flowise. If the
  // Flowise update fails after the DB commit, revert the DB update so the
  // two sources don't diverge.
  const { data, error } = await supabase
    .from('personas')
    .update(updates)
    .eq('id', personaId)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to update persona' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update Flowise chatflow if system prompt changed
  if (updates.system_prompt) {
    try {
      const temperature = (mergedSettings as PersonaSettings)?.temperature ||
                         currentPersona.settings?.temperature || 0.7;
      await updateChatflow(currentPersona.chatflow_id, updates.system_prompt as string, temperature);
    } catch (flowiseError) {
      console.error('Failed to update Flowise chatflow:', flowiseError);
      // Rollback the DB update so callers don't see stale data.
      await supabase
        .from('personas')
        .update({
          system_prompt: currentPersona.system_prompt,
          settings: currentPersona.settings,
        })
        .eq('id', personaId);
      return new Response(
        JSON.stringify({ error: 'Failed to sync changes to Flowise (reverted)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// DELETE - Soft delete persona
async function handleDelete(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  personaId: string
): Promise<Response> {
  // Get persona to delete chatflow
  const { data: persona, error: fetchError } = await supabase
    .from('personas')
    .select('chatflow_id')
    .eq('id', personaId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !persona) {
    return new Response(
      JSON.stringify({ error: 'Persona not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Delete chatflow from Flowise
  try {
    await deleteChatflow(persona.chatflow_id);
  } catch (error) {
    console.error('Failed to delete Flowise chatflow:', error);
    // Continue with soft delete even if Flowise delete fails
  }

  // Soft delete in database
  const { error } = await supabase
    .from('personas')
    .update({ status: 'deleted' })
    .eq('id', personaId)
    .eq('user_id', userId);

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to delete persona' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
