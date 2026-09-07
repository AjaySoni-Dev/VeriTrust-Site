from __future__ import annotations

import config

POLICY = {
    "max_iterations": config.MAX_ITERATIONS,
    "max_total_model_tokens": config.MAX_TOTAL_MODEL_TOKENS,
    "max_error_retries_per_step": config.MAX_ERROR_RETRIES_PER_STEP,
    "max_patch_retries": config.MAX_PATCH_RETRIES,
    "max_replans": config.MAX_REPLANS,
    "max_files_in_context": config.MAX_FILES_IN_CONTEXT,
    "max_file_bytes_in_context": config.MAX_FILE_BYTES_IN_CONTEXT,
    "max_file_tokens_in_context": config.MAX_FILE_TOKENS_IN_CONTEXT,
    "max_total_file_context_tokens": config.MAX_TOTAL_FILE_CONTEXT_TOKENS,
    "max_log_chars": config.MAX_LOG_CHARS,
    "command_timeout_seconds": config.COMMAND_TIMEOUT_SECONDS,
    "browser_timeout_seconds": config.BROWSER_TIMEOUT_SECONDS,
    "allow_uncertain_requirements": config.ALLOW_UNCERTAIN_REQUIREMENTS,
}

PHASE_ALLOWED_TOOLS = {
    "ANALYZE": {"list_files"},
    "PLAN": set(),
    "INSPECT": {"list_files", "search_files", "read_file"},
    "ACT": {"create_file", "create_files", "apply_patch", "edit_file", "move_file", "delete_file", "create_checkpoint"},
    "VERIFY": {"run_file", "run_command", "get_diagnostics", "validate_patch", "validate_project", "browser_verify"},
    "REPAIR": {"search_files", "read_file", "apply_patch", "edit_file", "create_checkpoint", "rollback"},
    "REPLAN": {"list_files", "search_files", "read_file"},
    "COMPLETE": {"package_project", "save_run_manifest"},
}
