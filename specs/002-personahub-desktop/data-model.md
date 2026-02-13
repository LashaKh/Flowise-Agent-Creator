# Data Model: PersonaHub Desktop

## Overview

Two data stores work together:
1. **Supabase (cloud)** — Source of truth for persona configs and user accounts
2. **SQLite (local)** — Local cache of persona configs + all desktop-only data (activity log, backup records, chat history, user preferences)

---

## Entity: PersonaConfig (local cache)

Synced from web platform. Stored locally for offline access.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key (matches web platform ID) |
| user_id | UUID | Owner |
| name | TEXT | Persona display name |
| system_prompt | TEXT | AI personality/instructions |
| chatflow_id | TEXT | Flowise chatflow ID |
| api_endpoint | TEXT | Flowise prediction URL |
| status | TEXT | creating / active / failed / deleted |
| enabled_tools | JSON | Array of tool IDs this persona can use |
| allowed_paths | JSON | Array of {path, mode: "read" | "readwrite"} |
| blocked_paths | JSON | Additional blocked paths (beyond hardcoded list) |
| confirmation_level | TEXT | paranoid / balanced / relaxed / trust |
| dangerous_tools_enabled | BOOLEAN | Whether dangerous tier is unlocked |
| activity_logging | BOOLEAN | Whether to log actions |
| undo_enabled | BOOLEAN | Whether to backup file changes |
| sandbox_enabled | BOOLEAN | Whether shell commands run in Docker |
| knowledge_base_refs | JSON | Array of {docId, title, syncedAt} |
| settings | JSON | temperature, model, custom instructions |
| synced_at | TIMESTAMP | Last sync from web platform |
| created_at | TIMESTAMP | Original creation date |
| updated_at | TIMESTAMP | Last modified |

**State transitions:** creating → active | failed. active → deleted.

---

## Entity: ActionLogEntry

Every tool invocation is logged. Stored locally only.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| persona_id | UUID | Which persona performed the action |
| tool | TEXT | Tool name (e.g., "write", "exec", "web_search") |
| action | TEXT | Human-readable description (e.g., "Create file") |
| target | TEXT | File path, URL, or other target (nullable) |
| content_preview | TEXT | First 200 chars of content (for file writes) |
| result | TEXT | allowed / denied / confirmed / undone |
| deny_reason | TEXT | blocked_path / tool_not_allowed / path_not_allowed / user_denied (nullable) |
| backup_id | UUID | Reference to BackupRecord if applicable (nullable) |
| created_at | TIMESTAMP | When the action occurred |

**Index:** persona_id + created_at (for Activity Log queries)

---

## Entity: BackupRecord

Tracks file backups for the undo system. Stored locally only.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| action_log_id | UUID | Reference to the ActionLogEntry |
| original_path | TEXT | Absolute path of the original file |
| backup_path | TEXT | Absolute path of the backup copy |
| action_type | TEXT | write / edit / delete |
| file_existed | BOOLEAN | Whether the file existed before the action |
| undone | BOOLEAN | Whether this backup has been restored |
| undone_at | TIMESTAMP | When undo was performed (nullable) |
| created_at | TIMESTAMP | When backup was created |

**Constraints:** Max 1000 records. Records older than 30 days auto-deleted. Oldest deleted first when limit reached.

---

## Entity: ChatSession

Conversation history per persona. Stored locally only.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| persona_id | UUID | Which persona this chat belongs to |
| session_id | TEXT | Flowise session ID (for Redis memory) |
| created_at | TIMESTAMP | When session started |
| updated_at | TIMESTAMP | Last message timestamp |

---

## Entity: ChatMessage

Individual messages within a chat session. Stored locally only.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | Reference to ChatSession |
| role | TEXT | user / assistant |
| content | TEXT | Message text |
| is_streaming | BOOLEAN | True while response is being received |
| error | TEXT | Error message if send failed (nullable) |
| created_at | TIMESTAMP | When message was sent/received |

---

## Entity: UserPreferences

App-level settings. One row per user. Stored locally only.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Owner |
| global_keyboard_shortcut | TEXT | Default: "CmdOrCtrl+Shift+P" |
| start_on_login | BOOLEAN | Default: true |
| notifications_enabled | BOOLEAN | Default: true |
| theme | TEXT | light / dark / system. Default: system |
| backup_retention_days | INTEGER | Default: 30 |
| max_backups | INTEGER | Default: 1000 |

---

## Entity: PermissionMemory

Remembers user's "Allow Always" choices to reduce confirmation fatigue.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| persona_id | UUID | Which persona |
| tool | TEXT | Tool name |
| path_pattern | TEXT | Folder pattern (e.g., "~/Documents/*") |
| permission | TEXT | allow_always / block_always |
| expires_at | TIMESTAMP | When this memory expires (nullable for permanent) |
| created_at | TIMESTAMP | When granted |

---

## Relationships

```
UserPreferences 1──── User
PersonaConfig N──── User
ChatSession N────1 PersonaConfig
ChatMessage N────1 ChatSession
ActionLogEntry N────1 PersonaConfig
BackupRecord 1────1 ActionLogEntry
PermissionMemory N────1 PersonaConfig
```

---

## New Web Platform Fields (Supabase)

The existing `personas` table needs these new columns to support desktop permissions:

| Field | Type | Description |
|-------|------|-------------|
| enabled_tools | JSONB | Array of tool IDs. Default: ["read", "ls", "web_search", "memory_search"] |
| allowed_paths | JSONB | Array of {path, mode}. Default: [] |
| confirmation_level | TEXT | paranoid / balanced / relaxed / trust. Default: "balanced" |
| dangerous_tools_enabled | BOOLEAN | Default: false |
| activity_logging | BOOLEAN | Default: true |
| undo_enabled | BOOLEAN | Default: true |
| sandbox_enabled | BOOLEAN | Default: false |
