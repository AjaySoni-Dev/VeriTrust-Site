"""Model-visible JSON schemas for bounded deterministic tools.

The runtime defaults to strict JSON orchestration, but these schemas are kept
separate from handlers so native tool calling can be enabled later without
changing the deterministic tool implementation.
"""

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files in the isolated project workspace.",
            "parameters": {
                "type": "object",
                "properties": {"recursive": {"type": "boolean"}},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": "Search text inside project files and return bounded snippets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "patterns": {"type": "array", "items": {"type": "string"}},
                    "max_results": {"type": "integer", "minimum": 1, "maximum": 50},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a project file and return its version hash.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "start_line": {"type": ["integer", "null"]},
                    "end_line": {"type": ["integer", "null"]},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_file",
            "description": "Atomically create a new project file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "overwrite": {"type": "boolean"},
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "apply_patch",
            "description": "Apply a minimal patch to an existing project file using an expected version hash.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "patch": {"type": "string"},
                    "expected_version": {"type": "string"},
                },
                "required": ["path", "patch", "expected_version"],
                "additionalProperties": False,
            },
        },
    },
]
