import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FLOWISE_BASE_URL = Deno.env.get('FLOWISE_BASE_URL') || 'https://flowise-2-0.onrender.com';
const FLOWISE_API_KEY = Deno.env.get('FLOWISE_API_KEY') || '';

// CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

// Flowise Configuration
const FLOWISE_CREDENTIALS = {
  googleGenerativeAI: 'f4e4f034-d71a-4039-b339-8dea1429fa06',
  upstashRedis: 'b88f589c-e0fd-4a2e-a353-0db6b491ac8e',
} as const;

const FLOWISE_TOOLS = {
  perplexityWideSearch: 'f4e953b6-8f59-4969-820d-946d00c3456d',
} as const;

const UPSTASH_REDIS_URL = 'https://obliging-zebra-56633.upstash.io';

interface PersonaSettings {
  temperature?: number;
  modelName?: string;
  customInstructions?: string;
}

interface CreatePersonaRequest {
  name: string;
}

interface UpdatePersonaRequest {
  systemPrompt?: string;
  settings?: Partial<PersonaSettings>;
}

// Build Flowise chatflow structure
function buildPersonaFlowData(systemPrompt: string, temperature: number = 0.7) {
  const memoryNodeId = 'upstashRedisBackedChatMemory_0';
  const chatModelNodeId = 'chatGoogleGenerativeAI_0';
  const toolNodeId = 'customTool_0';
  const agentNodeId = 'toolAgent_0';

  return {
    nodes: [
      {
        id: memoryNodeId,
        position: { x: 1376, y: -87 },
        type: 'customNode',
        width: 300,
        height: 427,
        data: {
          label: 'Upstash Redis-Backed Chat Memory',
          name: 'upstashRedisBackedChatMemory',
          version: 2,
          type: 'UpstashRedisBackedChatMemory',
          category: 'Memory',
          baseClasses: ['UpstashRedisBackedChatMemory', 'BaseChatMemory', 'BaseMemory'],
          credential: FLOWISE_CREDENTIALS.upstashRedis,
          inputs: {
            baseURL: UPSTASH_REDIS_URL,
            sessionId: '',
            sessionTTL: '',
            memoryKey: 'chat_history',
          },
          inputAnchors: [],
          inputParams: [
            { label: 'Connect Credential', name: 'credential', type: 'credential', id: `${memoryNodeId}-input-credential-credential` },
            { label: 'Upstash Redis REST URL', name: 'baseURL', type: 'string', id: `${memoryNodeId}-input-baseURL-string` },
            { label: 'Session Id', name: 'sessionId', type: 'string', optional: true, additionalParams: true, id: `${memoryNodeId}-input-sessionId-string` },
            { label: 'Memory Key', name: 'memoryKey', type: 'string', default: 'chat_history', additionalParams: true, id: `${memoryNodeId}-input-memoryKey-string` },
          ],
          outputAnchors: [
            { id: `${memoryNodeId}-output-upstashRedisBackedChatMemory-UpstashRedisBackedChatMemory|BaseChatMemory|BaseMemory`, name: 'upstashRedisBackedChatMemory', label: 'UpstashRedisBackedChatMemory', type: 'UpstashRedisBackedChatMemory | BaseChatMemory | BaseMemory' },
          ],
        },
      },
      {
        id: chatModelNodeId,
        position: { x: 1756, y: 457 },
        type: 'customNode',
        width: 300,
        height: 670,
        data: {
          label: 'ChatGoogleGenerativeAI',
          name: 'chatGoogleGenerativeAI',
          version: 2,
          type: 'ChatGoogleGenerativeAI',
          category: 'Chat Models',
          baseClasses: ['ChatGoogleGenerativeAI', 'BaseChatModel', 'BaseLanguageModel', 'Runnable'],
          credential: FLOWISE_CREDENTIALS.googleGenerativeAI,
          inputs: {
            modelName: 'gemini-2.5-flash',
            temperature,
            streaming: true,
            maxOutputTokens: '',
            topP: '',
            topK: '',
          },
          inputAnchors: [],
          inputParams: [
            { label: 'Connect Credential', name: 'credential', type: 'credential', id: `${chatModelNodeId}-input-credential-credential` },
            { label: 'Model Name', name: 'modelName', type: 'asyncOptions', default: 'gemini-2.5-flash', id: `${chatModelNodeId}-input-modelName-asyncOptions` },
            { label: 'Temperature', name: 'temperature', type: 'number', default: 0.7, optional: true, id: `${chatModelNodeId}-input-temperature-number` },
            { label: 'Streaming', name: 'streaming', type: 'boolean', default: true, optional: true, id: `${chatModelNodeId}-input-streaming-boolean` },
          ],
          outputAnchors: [
            { id: `${chatModelNodeId}-output-chatGoogleGenerativeAI-ChatGoogleGenerativeAI|BaseChatModel|BaseLanguageModel|Runnable`, name: 'chatGoogleGenerativeAI', label: 'ChatGoogleGenerativeAI', type: 'ChatGoogleGenerativeAI | BaseChatModel | BaseLanguageModel | Runnable' },
          ],
        },
      },
      {
        id: toolNodeId,
        position: { x: 1988, y: -219 },
        type: 'customNode',
        width: 300,
        height: 373,
        data: {
          label: 'Custom Tool',
          name: 'customTool',
          version: 3,
          type: 'CustomTool',
          category: 'Tools',
          baseClasses: ['CustomTool', 'Tool', 'StructuredTool', 'Runnable'],
          inputs: {
            selectedTool: FLOWISE_TOOLS.perplexityWideSearch,
            returnDirect: false,
          },
          inputAnchors: [],
          inputParams: [
            { label: 'Select Tool', name: 'selectedTool', type: 'asyncOptions', id: `${toolNodeId}-input-selectedTool-asyncOptions` },
          ],
          outputAnchors: [
            { id: `${toolNodeId}-output-customTool-CustomTool|Tool|StructuredTool|Runnable`, name: 'customTool', label: 'CustomTool', type: 'CustomTool | Tool | StructuredTool | Runnable' },
          ],
        },
      },
      {
        id: agentNodeId,
        position: { x: 2431, y: 32 },
        type: 'customNode',
        width: 300,
        height: 486,
        data: {
          label: 'Tool Agent',
          name: 'toolAgent',
          version: 2,
          type: 'AgentExecutor',
          category: 'Agents',
          baseClasses: ['AgentExecutor', 'BaseChain', 'Runnable'],
          inputs: {
            tools: [`{{${toolNodeId}.data.instance}}`],
            memory: `{{${memoryNodeId}.data.instance}}`,
            model: `{{${chatModelNodeId}.data.instance}}`,
            chatPromptTemplate: '',
            systemMessage: systemPrompt,
            inputModeration: '',
            maxIterations: '',
          },
          inputAnchors: [
            { label: 'Tools', name: 'tools', type: 'Tool', list: true, id: `${agentNodeId}-input-tools-Tool` },
            { label: 'Memory', name: 'memory', type: 'BaseChatMemory', id: `${agentNodeId}-input-memory-BaseChatMemory` },
            { label: 'Tool Calling Chat Model', name: 'model', type: 'BaseChatModel', id: `${agentNodeId}-input-model-BaseChatModel` },
          ],
          inputParams: [
            { label: 'System Message', name: 'systemMessage', type: 'string', default: 'You are a helpful AI assistant.', rows: 4, optional: true, additionalParams: true, id: `${agentNodeId}-input-systemMessage-string` },
          ],
          outputAnchors: [
            { id: `${agentNodeId}-output-toolAgent-AgentExecutor|BaseChain|Runnable`, name: 'toolAgent', label: 'AgentExecutor', type: 'AgentExecutor | BaseChain | Runnable' },
          ],
        },
      },
    ],
    edges: [
      {
        source: memoryNodeId,
        sourceHandle: `${memoryNodeId}-output-upstashRedisBackedChatMemory-UpstashRedisBackedChatMemory|BaseChatMemory|BaseMemory`,
        target: agentNodeId,
        targetHandle: `${agentNodeId}-input-memory-BaseChatMemory`,
        type: 'buttonedge',
        id: `${memoryNodeId}-${agentNodeId}-memory`,
      },
      {
        source: chatModelNodeId,
        sourceHandle: `${chatModelNodeId}-output-chatGoogleGenerativeAI-ChatGoogleGenerativeAI|BaseChatModel|BaseLanguageModel|Runnable`,
        target: agentNodeId,
        targetHandle: `${agentNodeId}-input-model-BaseChatModel`,
        type: 'buttonedge',
        id: `${chatModelNodeId}-${agentNodeId}-model`,
      },
      {
        source: toolNodeId,
        sourceHandle: `${toolNodeId}-output-customTool-CustomTool|Tool|StructuredTool|Runnable`,
        target: agentNodeId,
        targetHandle: `${agentNodeId}-input-tools-Tool`,
        type: 'buttonedge',
        id: `${toolNodeId}-${agentNodeId}-tools`,
      },
    ],
    viewport: { x: -504, y: 104, zoom: 0.52 },
  };
}

async function createChatflow(personaName: string, systemPrompt: string, temperature?: number) {
  const flowData = buildPersonaFlowData(systemPrompt, temperature);
  const response = await fetch(`${FLOWISE_BASE_URL}/api/v1/chatflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FLOWISE_API_KEY}`,
    },
    body: JSON.stringify({
      name: personaName,
      flowData: JSON.stringify(flowData),
      deployed: true,
      isPublic: false,
      type: 'CHATFLOW',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create chatflow: ${error}`);
  }

  return response.json();
}

async function deleteChatflow(chatflowId: string) {
  const response = await fetch(`${FLOWISE_BASE_URL}/api/v1/chatflows/${chatflowId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${FLOWISE_API_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete chatflow: ${error}`);
  }
}

async function updateChatflow(chatflowId: string, systemPrompt: string, temperature?: number) {
  const flowData = buildPersonaFlowData(systemPrompt, temperature);
  const response = await fetch(`${FLOWISE_BASE_URL}/api/v1/chatflows/${chatflowId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FLOWISE_API_KEY}`,
    },
    body: JSON.stringify({
      flowData: JSON.stringify(flowData),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update chatflow: ${error}`);
  }

  return response.json();
}

function buildPredictionEndpoint(chatflowId: string): string {
  return `${FLOWISE_BASE_URL}/api/v1/prediction/${chatflowId}`;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

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

async function handleGet(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  personaId: string | null
): Promise<Response> {
  if (personaId) {
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

async function handlePost(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: CreatePersonaRequest
): Promise<Response> {
  const { name } = body;

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

  const { data: persona, error: insertError } = await supabase
    .from('personas')
    .insert({
      user_id: userId,
      name: trimmedName,
      chatflow_id: 'pending',
      system_prompt: 'pending',
      api_endpoint: 'pending',
      status: 'creating',
    })
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
    // CRITICAL: Call the generate-prompt edge function
    console.log('Calling generate-prompt function for:', trimmedName);
    const generatePromptResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-prompt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ name: trimmedName }),
      }
    );

    if (!generatePromptResponse.ok) {
      const errorText = await generatePromptResponse.text();
      console.error('Generate prompt failed:', errorText);
      throw new Error(`Failed to generate prompt: ${errorText}`);
    }

    const { systemPrompt } = await generatePromptResponse.json();
    console.log('Generated prompt length:', systemPrompt?.length || 0);

    const chatflow = await createChatflow(trimmedName, systemPrompt);
    const apiEndpoint = buildPredictionEndpoint(chatflow.id);

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

async function handlePatch(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  personaId: string,
  body: UpdatePersonaRequest
): Promise<Response> {
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

  if (body.settings !== undefined) {
    updates.settings = { ...currentPersona.settings, ...body.settings };
  }

  if (updates.system_prompt) {
    try {
      const temperature = (updates.settings as PersonaSettings)?.temperature ||
                         currentPersona.settings?.temperature || 0.7;
      await updateChatflow(currentPersona.chatflow_id, updates.system_prompt as string, temperature);
    } catch (error) {
      console.error('Failed to update Flowise chatflow:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to sync changes to Flowise' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

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

  return new Response(
    JSON.stringify({ data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleDelete(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  personaId: string
): Promise<Response> {
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

  try {
    await deleteChatflow(persona.chatflow_id);
  } catch (error) {
    console.error('Failed to delete Flowise chatflow:', error);
  }

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
