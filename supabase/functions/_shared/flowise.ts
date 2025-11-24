/**
 * Flowise API Client
 * Handles all communication with the Flowise API
 */

// ============================================
// Configuration
// ============================================

const FLOWISE_CONFIG = {
  baseUrl: Deno.env.get('FLOWISE_BASE_URL') || 'https://flowise-2-0.onrender.com',
  apiKey: Deno.env.get('FLOWISE_API_KEY') || '',
  defaultModel: 'gemini-2.5-flash',
  defaultTemperature: 0.7,
} as const;

const FLOWISE_CREDENTIALS = {
  googleGenerativeAI: 'f4e4f034-d71a-4039-b339-8dea1429fa06',
  upstashRedis: 'b88f589c-e0fd-4a2e-a353-0db6b491ac8e',
} as const;

const FLOWISE_TOOLS = {
  perplexityWideSearch: 'f4e953b6-8f59-4969-820d-946d00c3456d',
} as const;

const UPSTASH_REDIS_URL = 'https://obliging-zebra-56633.upstash.io';

// ============================================
// Types
// ============================================

interface FlowisePosition {
  x: number;
  y: number;
}

interface FlowiseNode {
  id: string;
  position: FlowisePosition;
  type: 'customNode';
  data: Record<string, unknown>;
  width: number;
  height: number;
}

interface FlowiseEdge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  type: 'buttonedge';
  id: string;
}

interface FlowData {
  nodes: FlowiseNode[];
  edges: FlowiseEdge[];
  viewport: { x: number; y: number; zoom: number };
}

interface CreateChatflowRequest {
  name: string;
  flowData: string;
  deployed: boolean;
  isPublic: boolean;
  type: 'CHATFLOW';
}

export interface ChatflowResponse {
  id: string;
  name: string;
  flowData: string;
  deployed: boolean;
  isPublic: boolean;
  type: string;
  createdDate: string;
  updatedDate: string;
}

// ============================================
// Node Factory Functions
// ============================================

function createMemoryNode(nodeId: string): FlowiseNode {
  return {
    id: nodeId,
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
      description: 'Summarizes the conversation and stores the memory in Upstash Redis server',
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
        {
          label: 'Connect Credential',
          name: 'credential',
          type: 'credential',
          id: `${nodeId}-input-credential-credential`,
        },
        {
          label: 'Upstash Redis REST URL',
          name: 'baseURL',
          type: 'string',
          id: `${nodeId}-input-baseURL-string`,
        },
        {
          label: 'Session Id',
          name: 'sessionId',
          type: 'string',
          optional: true,
          additionalParams: true,
          id: `${nodeId}-input-sessionId-string`,
        },
        {
          label: 'Memory Key',
          name: 'memoryKey',
          type: 'string',
          default: 'chat_history',
          additionalParams: true,
          id: `${nodeId}-input-memoryKey-string`,
        },
      ],
      outputAnchors: [
        {
          id: `${nodeId}-output-upstashRedisBackedChatMemory-UpstashRedisBackedChatMemory|BaseChatMemory|BaseMemory`,
          name: 'upstashRedisBackedChatMemory',
          label: 'UpstashRedisBackedChatMemory',
          type: 'UpstashRedisBackedChatMemory | BaseChatMemory | BaseMemory',
        },
      ],
    },
  };
}

function createChatModelNode(
  nodeId: string,
  modelName: string = FLOWISE_CONFIG.defaultModel,
  temperature: number = FLOWISE_CONFIG.defaultTemperature
): FlowiseNode {
  return {
    id: nodeId,
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
      description: 'Wrapper around Google Gemini large language models',
      baseClasses: ['ChatGoogleGenerativeAI', 'BaseChatModel', 'BaseLanguageModel', 'Runnable'],
      credential: FLOWISE_CREDENTIALS.googleGenerativeAI,
      inputs: {
        modelName,
        temperature,
        streaming: true,
        maxOutputTokens: '',
        topP: '',
        topK: '',
      },
      inputAnchors: [],
      inputParams: [
        {
          label: 'Connect Credential',
          name: 'credential',
          type: 'credential',
          id: `${nodeId}-input-credential-credential`,
        },
        {
          label: 'Model Name',
          name: 'modelName',
          type: 'asyncOptions',
          default: 'gemini-2.5-flash',
          id: `${nodeId}-input-modelName-asyncOptions`,
        },
        {
          label: 'Temperature',
          name: 'temperature',
          type: 'number',
          default: 0.7,
          optional: true,
          id: `${nodeId}-input-temperature-number`,
        },
        {
          label: 'Streaming',
          name: 'streaming',
          type: 'boolean',
          default: true,
          optional: true,
          id: `${nodeId}-input-streaming-boolean`,
        },
      ],
      outputAnchors: [
        {
          id: `${nodeId}-output-chatGoogleGenerativeAI-ChatGoogleGenerativeAI|BaseChatModel|BaseLanguageModel|Runnable`,
          name: 'chatGoogleGenerativeAI',
          label: 'ChatGoogleGenerativeAI',
          type: 'ChatGoogleGenerativeAI | BaseChatModel | BaseLanguageModel | Runnable',
        },
      ],
    },
  };
}

function createToolNode(nodeId: string): FlowiseNode {
  return {
    id: nodeId,
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
      description: "Use custom tool you've created in Flowise within chatflow",
      baseClasses: ['CustomTool', 'Tool', 'StructuredTool', 'Runnable'],
      inputs: {
        selectedTool: FLOWISE_TOOLS.perplexityWideSearch,
        returnDirect: false,
      },
      inputAnchors: [],
      inputParams: [
        {
          label: 'Select Tool',
          name: 'selectedTool',
          type: 'asyncOptions',
          id: `${nodeId}-input-selectedTool-asyncOptions`,
        },
        {
          label: 'Tool Name',
          name: 'customToolName',
          type: 'string',
          placeholder: 'Enter tool name',
          description: 'Name of the tool',
          optional: true,
          additionalParams: true,
          id: `${nodeId}-input-customToolName-string`,
        },
        {
          label: 'Tool Description',
          name: 'customToolDesc',
          type: 'string',
          rows: 4,
          placeholder: 'Enter tool description',
          description: 'Description of what the tool does',
          optional: true,
          additionalParams: true,
          id: `${nodeId}-input-customToolDesc-string`,
        },
        {
          label: 'Tool Schema',
          name: 'customToolSchema',
          type: 'string',
          rows: 4,
          placeholder: 'Enter schema in JSON format',
          description: 'JSON schema for tool parameters',
          optional: true,
          additionalParams: true,
          id: `${nodeId}-input-customToolSchema-string`,
        },
        {
          label: 'Tool Function',
          name: 'customToolFunc',
          type: 'code',
          rows: 10,
          placeholder: 'Enter function code',
          description: 'JavaScript function to execute',
          optional: true,
          additionalParams: true,
          id: `${nodeId}-input-customToolFunc-code`,
        },
        {
          label: 'Return Direct',
          name: 'returnDirect',
          type: 'boolean',
          optional: true,
          additionalParams: true,
          id: `${nodeId}-input-returnDirect-boolean`,
        },
      ],
      outputAnchors: [
        {
          id: `${nodeId}-output-customTool-CustomTool|Tool|StructuredTool|Runnable`,
          name: 'customTool',
          label: 'CustomTool',
          type: 'CustomTool | Tool | StructuredTool | Runnable',
        },
      ],
    },
  };
}

function createAgentNode(
  nodeId: string,
  systemMessage: string,
  memoryNodeId: string,
  chatModelNodeId: string,
  toolNodeId: string
): FlowiseNode {
  return {
    id: nodeId,
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
      description: 'Agent that uses Function Calling to pick the tools and args to call',
      baseClasses: ['AgentExecutor', 'BaseChain', 'Runnable'],
      inputs: {
        tools: [`{{${toolNodeId}.data.instance}}`],
        memory: `{{${memoryNodeId}.data.instance}}`,
        model: `{{${chatModelNodeId}.data.instance}}`,
        chatPromptTemplate: '',
        systemMessage,
        inputModeration: '',
        maxIterations: '',
      },
      inputAnchors: [
        {
          label: 'Tools',
          name: 'tools',
          type: 'Tool',
          list: true,
          id: `${nodeId}-input-tools-Tool`,
        },
        {
          label: 'Memory',
          name: 'memory',
          type: 'BaseChatMemory',
          id: `${nodeId}-input-memory-BaseChatMemory`,
        },
        {
          label: 'Tool Calling Chat Model',
          name: 'model',
          type: 'BaseChatModel',
          id: `${nodeId}-input-model-BaseChatModel`,
        },
      ],
      inputParams: [
        {
          label: 'System Message',
          name: 'systemMessage',
          type: 'string',
          default: 'You are a helpful AI assistant.',
          rows: 4,
          optional: true,
          additionalParams: true,
          id: `${nodeId}-input-systemMessage-string`,
        },
      ],
      outputAnchors: [
        {
          id: `${nodeId}-output-toolAgent-AgentExecutor|BaseChain|Runnable`,
          name: 'toolAgent',
          label: 'AgentExecutor',
          type: 'AgentExecutor | BaseChain | Runnable',
        },
      ],
    },
  };
}

function createEdges(
  memoryNodeId: string,
  chatModelNodeId: string,
  toolNodeId: string,
  agentNodeId: string
): FlowiseEdge[] {
  return [
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
  ];
}

// ============================================
// Public API
// ============================================

export function buildPersonaFlowData(
  systemPrompt: string,
  temperature: number = FLOWISE_CONFIG.defaultTemperature
): FlowData {
  const memoryNodeId = 'upstashRedisBackedChatMemory_0';
  const chatModelNodeId = 'chatGoogleGenerativeAI_0';
  const toolNodeId = 'customTool_0';
  const agentNodeId = 'toolAgent_0';

  return {
    nodes: [
      createMemoryNode(memoryNodeId),
      createChatModelNode(chatModelNodeId, FLOWISE_CONFIG.defaultModel, temperature),
      createToolNode(toolNodeId),
      createAgentNode(agentNodeId, systemPrompt, memoryNodeId, chatModelNodeId, toolNodeId),
    ],
    edges: createEdges(memoryNodeId, chatModelNodeId, toolNodeId, agentNodeId),
    viewport: { x: -504, y: 104, zoom: 0.52 },
  };
}

export function buildCreateChatflowRequest(
  personaName: string,
  systemPrompt: string,
  temperature?: number
): CreateChatflowRequest {
  const flowData = buildPersonaFlowData(systemPrompt, temperature);

  return {
    name: personaName,
    flowData: JSON.stringify(flowData),
    deployed: true,
    isPublic: false,
    type: 'CHATFLOW',
  };
}

export function buildPredictionEndpoint(chatflowId: string): string {
  return `${FLOWISE_CONFIG.baseUrl}/api/v1/prediction/${chatflowId}`;
}

export async function createChatflow(
  personaName: string,
  systemPrompt: string,
  temperature?: number
): Promise<ChatflowResponse> {
  const request = buildCreateChatflowRequest(personaName, systemPrompt, temperature);

  const response = await fetch(`${FLOWISE_CONFIG.baseUrl}/api/v1/chatflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FLOWISE_CONFIG.apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create chatflow: ${error}`);
  }

  return response.json();
}

export async function deleteChatflow(chatflowId: string): Promise<void> {
  const response = await fetch(`${FLOWISE_CONFIG.baseUrl}/api/v1/chatflows/${chatflowId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${FLOWISE_CONFIG.apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete chatflow: ${error}`);
  }
}

export async function updateChatflow(
  chatflowId: string,
  systemPrompt: string,
  temperature?: number
): Promise<ChatflowResponse> {
  const flowData = buildPersonaFlowData(systemPrompt, temperature);

  const response = await fetch(`${FLOWISE_CONFIG.baseUrl}/api/v1/chatflows/${chatflowId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FLOWISE_CONFIG.apiKey}`,
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
