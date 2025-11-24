# Flowise API Reference for AI Persona Builder

## Verified Configuration

**Flowise Instance**: https://flowise-2-0.onrender.com
**API Key**: `ijD+kfSjYMcqEyBHNCHyEaymDzrD7br4BW4/DRe/eYI=`

---

## API Endpoints

### List Chatflows
```bash
GET /api/v1/chatflows
Authorization: Bearer {API_KEY}
```

### Create Chatflow
```bash
POST /api/v1/chatflows
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "name": "Persona Name",
  "flowData": "{...JSON stringified...}",
  "deployed": true,
  "isPublic": false,
  "type": "CHATFLOW"
}
```

### Get Chatflow
```bash
GET /api/v1/chatflows/{id}
Authorization: Bearer {API_KEY}
```

### Update Chatflow
```bash
PUT /api/v1/chatflows/{id}
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

### Delete Chatflow
```bash
DELETE /api/v1/chatflows/{id}
Authorization: Bearer {API_KEY}
```

---

## Verified Credentials

| Type | Name | ID |
|------|------|-----|
| Google Generative AI | lasha3101@gmail.com | `f4e4f034-d71a-4039-b339-8dea1429fa06` |
| Upstash Redis Memory | - | `b88f589c-e0fd-4a2e-a353-0db6b491ac8e` |

## Verified Tools

| Name | ID |
|------|-----|
| PerplexityWideSearch | `f4e953b6-8f59-4969-820d-946d00c3456d` |

---

## Chatflow Node Structure (from Christiano Ronaldo example)

### Node Types Required

1. **ChatGoogleGenerativeAI** - Chat model (Gemini 2.5 Flash)
2. **UpstashRedisBackedChatMemory** - Conversation memory
3. **CustomTool** - PerplexityWideSearch for web search
4. **AgentExecutor (Tool Agent)** - Main agent with system prompt

### Node Connections (Edges)

```
Memory ──────────────────→ Tool Agent
Chat Model ──────────────→ Tool Agent
Custom Tool ─────────────→ Tool Agent
```

### FlowData Structure

```json
{
  "nodes": [
    {
      "id": "upstashRedisBackedChatMemory_0",
      "position": {"x": 1376, "y": -87},
      "type": "customNode",
      "data": {
        "label": "Upstash Redis-Backed Chat Memory",
        "name": "upstashRedisBackedChatMemory",
        "type": "UpstashRedisBackedChatMemory",
        "inputs": {
          "baseURL": "https://obliging-zebra-56633.upstash.io",
          "memoryKey": "chat_history"
        }
      }
    },
    {
      "id": "chatGoogleGenerativeAI_0",
      "position": {"x": 1756, "y": 457},
      "type": "customNode",
      "data": {
        "label": "ChatGoogleGenerativeAI",
        "name": "chatGoogleGenerativeAI",
        "type": "ChatGoogleGenerativeAI",
        "inputs": {
          "modelName": "gemini-2.5-flash",
          "temperature": 0.7,
          "streaming": true
        }
      }
    },
    {
      "id": "customTool_0",
      "position": {"x": 1988, "y": -219},
      "type": "customNode",
      "data": {
        "label": "Custom Tool",
        "name": "customTool",
        "type": "CustomTool",
        "inputs": {
          "selectedTool": "f4e953b6-8f59-4969-820d-946d00c3456d"
        }
      }
    },
    {
      "id": "toolAgent_0",
      "position": {"x": 2431, "y": 32},
      "type": "customNode",
      "data": {
        "label": "Tool Agent",
        "name": "toolAgent",
        "type": "AgentExecutor",
        "inputs": {
          "tools": ["{{customTool_0.data.instance}}"],
          "memory": "{{upstashRedisBackedChatMemory_0.data.instance}}",
          "model": "{{chatGoogleGenerativeAI_0.data.instance}}",
          "systemMessage": "YOUR GENERATED SYSTEM PROMPT HERE"
        }
      }
    }
  ],
  "edges": [
    {
      "source": "upstashRedisBackedChatMemory_0",
      "target": "toolAgent_0",
      "sourceHandle": "upstashRedisBackedChatMemory_0-output-upstashRedisBackedChatMemory-UpstashRedisBackedChatMemory",
      "targetHandle": "toolAgent_0-input-memory-BaseChatMemory"
    },
    {
      "source": "chatGoogleGenerativeAI_0",
      "target": "toolAgent_0",
      "sourceHandle": "chatGoogleGenerativeAI_0-output-chatGoogleGenerativeAI-ChatGoogleGenerativeAI",
      "targetHandle": "toolAgent_0-input-model-BaseChatModel"
    },
    {
      "source": "customTool_0",
      "target": "toolAgent_0",
      "sourceHandle": "customTool_0-output-customTool-CustomTool",
      "targetHandle": "toolAgent_0-input-tools-Tool"
    }
  ],
  "viewport": {"x": 0, "y": 0, "zoom": 1}
}
```

---

## System Prompt Template

Based on the Cristiano Ronaldo example, prompts follow this structure:

```markdown
## SYSTEM PROMPT: **{PERSONA_NAME}** (Never Break Character)

You are **{PERSONA_NAME}**, {brief description}. You will always respond as
{PERSONA_NAME}—never revealing or hinting that you are an AI.

### 1. Identity & Style
- **Identity**: You are {full name/title}—{achievements/credentials}
- **Never Break Character**: ...
- **Personality & Tone**: ...

### 2. Communication Style
1. **Vibrant & Entertaining** ...
2. **Humor & Charm** ...
3. **Motivational Flair** ...
4. **Banter & Real-Life Anecdotes** ...

### 3. Knowledge & Expertise
{Domain-specific knowledge areas}

### 4. Interaction & Engagement
{How to interact with users}

### 5. Constraints & Guidelines
{Behavioral boundaries}

### 6. Tools
**PerplexityWideSearch** - You have access to web search...

### 7. Final Notes
- **Mission**: ...
- **Promise**: ...
- **Parting Shot**: ...

# You must always use the PerplexityWideSearch tool to answer questions
requiring additional context.
```

---

## Prediction API (Chat with Persona)

After chatflow creation, users interact via:

```python
import requests

API_URL = "https://flowise-2-0.onrender.com/api/v1/prediction/{chatflow-id}"

def query(payload):
    response = requests.post(API_URL, json=payload)
    return response.json()

output = query({
    "question": "Hey, how are you?",
})
```
