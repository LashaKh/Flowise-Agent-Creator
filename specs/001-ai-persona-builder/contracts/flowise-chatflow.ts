/**
 * Flowise Chatflow Data Types
 *
 * TypeScript definitions for creating chatflows via the Flowise API.
 * Based on verified reference-flowdata.json structure.
 */

// ============================================
// Core Flowise Types
// ============================================

export interface FlowisePosition {
  x: number;
  y: number;
}

export interface FlowiseViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FlowiseNode {
  id: string;
  position: FlowisePosition;
  type: 'customNode';
  data: FlowiseNodeData;
  width: number;
  height: number;
  selected?: boolean;
  dragging?: boolean;
  positionAbsolute?: FlowisePosition;
}

export interface FlowiseNodeData {
  label: string;
  name: string;
  version: number;
  type: string;
  icon?: string;
  category?: string;
  description?: string;
  baseClasses: string[];
  credential?: string;
  inputs: Record<string, unknown>;
  inputAnchors?: FlowiseInputAnchor[];
  inputParams?: FlowiseInputParam[];
  outputs?: Record<string, unknown>;
  outputAnchors?: FlowiseOutputAnchor[];
  filePath?: string;
  id?: string;
  selected?: boolean;
}

export interface FlowiseInputAnchor {
  label: string;
  name: string;
  type: string;
  optional?: boolean;
  list?: boolean;
  description?: string;
  id: string;
}

export interface FlowiseInputParam {
  label: string;
  name: string;
  type: string;
  default?: unknown;
  optional?: boolean;
  description?: string;
  additionalParams?: boolean;
  rows?: number;
  placeholder?: string;
  id: string;
}

export interface FlowiseOutputAnchor {
  id: string;
  name: string;
  label: string;
  description?: string;
  type: string;
}

export interface FlowiseEdge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  type: 'buttonedge';
  id: string;
}

export interface FlowData {
  nodes: FlowiseNode[];
  edges: FlowiseEdge[];
  viewport: FlowiseViewport;
}

// ============================================
// Chatflow API Types
// ============================================

export interface CreateChatflowRequest {
  name: string;
  flowData: string; // JSON stringified FlowData
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
// Verified Credential IDs
// ============================================

export const FLOWISE_CREDENTIALS = {
  googleGenerativeAI: 'f4e4f034-d71a-4039-b339-8dea1429fa06',
  upstashRedis: 'b88f589c-e0fd-4a2e-a353-0db6b491ac8e',
} as const;

export const FLOWISE_TOOLS = {
  perplexityWideSearch: 'f4e953b6-8f59-4969-820d-946d00c3456d',
} as const;

export const FLOWISE_CONFIG = {
  baseUrl: 'https://flowise-2-0.onrender.com',
  upstashRedisUrl: 'https://obliging-zebra-56633.upstash.io',
  defaultModel: 'gemini-2.5-flash',
  defaultTemperature: 0.7,
} as const;

// ============================================
// Node Factory Functions
// ============================================

/**
 * Create Upstash Redis-Backed Chat Memory node
 */
export function createMemoryNode(nodeId: string): FlowiseNode {
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
        baseURL: FLOWISE_CONFIG.upstashRedisUrl,
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

/**
 * Create ChatGoogleGenerativeAI node (Gemini)
 */
export function createChatModelNode(
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

/**
 * Create Custom Tool node (PerplexityWideSearch)
 */
export function createToolNode(nodeId: string): FlowiseNode {
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
        returnDirect: '',
        customToolName: '',
        customToolDesc: '',
        customToolSchema: '',
        customToolFunc: '',
      },
      inputAnchors: [],
      inputParams: [
        {
          label: 'Select Tool',
          name: 'selectedTool',
          type: 'asyncOptions',
          id: `${nodeId}-input-selectedTool-asyncOptions`,
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

/**
 * Create Tool Agent node
 */
export function createAgentNode(
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

/**
 * Create edges connecting all nodes to the agent
 */
export function createEdges(
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

/**
 * Build complete FlowData for a persona chatflow
 */
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

/**
 * Build the complete chatflow creation request
 */
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

/**
 * Build the prediction API endpoint URL
 */
export function buildPredictionEndpoint(chatflowId: string): string {
  return `${FLOWISE_CONFIG.baseUrl}/api/v1/prediction/${chatflowId}`;
}
