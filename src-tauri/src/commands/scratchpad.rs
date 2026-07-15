//! Per-project scratchpad commands — thin shims over the orchestrator's
//! scratchpad API. Persistence (a JSON file in the app data dir, keyed by
//! project root) lives in `podium_core::scratchpad`.

use tauri::State;

use podium_core::{ProjectId, ScratchpadId, ScratchpadInfo};

use crate::error::IpcError;
use crate::state::AppState;

/// List a project's active (non-archived) scratchpads.
#[tauri::command]
pub fn scratchpad_list(
    state: State<'_, AppState>,
    project_id: ProjectId,
) -> Result<Vec<ScratchpadInfo>, IpcError> {
    state
        .orchestrator
        .list_scratchpads(project_id)
        .map_err(Into::into)
}

/// Create a new scratchpad (auto-generated timestamp title, empty content).
/// Always attributed to `"User"` — this command is only ever called from the
/// human-facing UI; agents get their own MCP tool.
#[tauri::command]
pub fn scratchpad_add(
    state: State<'_, AppState>,
    project_id: ProjectId,
) -> Result<ScratchpadInfo, IpcError> {
    state
        .orchestrator
        .add_scratchpad(project_id, "User")
        .map_err(Into::into)
}

/// Replace a scratchpad's content (bumps its version). Always attributed to
/// `"User"`.
#[tauri::command]
pub fn scratchpad_update_content(
    state: State<'_, AppState>,
    project_id: ProjectId,
    id: ScratchpadId,
    content: String,
) -> Result<ScratchpadInfo, IpcError> {
    state
        .orchestrator
        .update_scratchpad_content(project_id, id, &content, "User")
        .map_err(Into::into)
}

/// Revise a scratchpad's title (blank falls back to a timestamp title).
/// Always attributed to `"User"`.
#[tauri::command]
pub fn scratchpad_update_title(
    state: State<'_, AppState>,
    project_id: ProjectId,
    id: ScratchpadId,
    title: String,
) -> Result<ScratchpadInfo, IpcError> {
    state
        .orchestrator
        .update_scratchpad_title(project_id, id, &title, "User")
        .map_err(Into::into)
}
