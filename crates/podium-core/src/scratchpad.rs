//! Per-project scratchpads, persisted as one JSON file in the app data dir.
//!
//! Scratchpads are keyed by the project's **root path** (not the per-run
//! [`ProjectId`]), so they survive app restarts and project close/re-open.
//! Writes are atomic (temp file + rename); a missing or corrupt file is
//! treated as an empty store. Until [`ScratchpadStore::set_path`] is called
//! the store is in-memory only (tests, or a data dir that failed to resolve).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use crate::ids::{ProjectId, ScratchpadId};

const LOCK_POISONED: &str = "scratchpad store lock poisoned";

/// Read-only snapshot of one scratchpad, for listing over IPC/MCP.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadInfo {
    pub id: ScratchpadId,
    pub project_id: ProjectId,
    pub title: String,
    pub content: String,
    /// Whether the scratchpad is archived. Always `false` for now — Phase 4
    /// adds real archiving, but the field is included now so the struct
    /// shape stays stable.
    pub archived: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Who last touched the scratchpad's content: `"User"` or an agent name
    /// (the caller decides).
    pub updated_by: String,
    /// Increments on every content update, starting at 1.
    pub version: u32,
}

/// One scratchpad as persisted on disk; the project association is the map
/// key (root path), so the per-run `ProjectId` is attached only at read time.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredScratchpad {
    id: ScratchpadId,
    title: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    archived: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    #[serde(default)]
    updated_by: String,
    #[serde(default = "default_version")]
    version: u32,
}

fn default_version() -> u32 {
    1
}

impl StoredScratchpad {
    fn info(&self, project_id: ProjectId) -> ScratchpadInfo {
        ScratchpadInfo {
            id: self.id,
            project_id,
            title: self.title.clone(),
            content: self.content.clone(),
            archived: self.archived,
            created_at: self.created_at,
            updated_at: self.updated_at,
            updated_by: self.updated_by.clone(),
            version: self.version,
        }
    }
}

/// Every project's scratchpads, keyed by project root path (BTreeMap for a
/// stable on-disk order).
type ScratchpadMap = BTreeMap<String, Vec<StoredScratchpad>>;

struct Inner {
    path: Option<PathBuf>,
    scratchpads: ScratchpadMap,
}

/// Thread-safe scratchpad store shared by the orchestrator's public API.
pub(crate) struct ScratchpadStore {
    inner: Mutex<Inner>,
}

impl ScratchpadStore {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                path: None,
                scratchpads: ScratchpadMap::new(),
            }),
        }
    }

    /// Point the store at its backing file and load whatever is there. Any
    /// in-memory scratchpads accumulated before this call are replaced.
    pub fn set_path(&self, path: PathBuf) {
        let scratchpads = load(&path);
        let mut inner = self.inner.lock().expect(LOCK_POISONED);
        inner.path = Some(path);
        inner.scratchpads = scratchpads;
    }

    /// The active (non-archived) scratchpads for a project.
    pub fn list(&self, project_id: ProjectId, root: &Path) -> Vec<ScratchpadInfo> {
        let inner = self.inner.lock().expect(LOCK_POISONED);
        inner
            .scratchpads
            .get(&key(root))
            .map(|items| {
                items
                    .iter()
                    .filter(|s| !s.archived)
                    .map(|s| s.info(project_id))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Create a new scratchpad with an auto-generated timestamp title and
    /// empty content.
    pub fn add(
        &self,
        project_id: ProjectId,
        root: &Path,
        updated_by: &str,
    ) -> CoreResult<ScratchpadInfo> {
        let now = Utc::now();
        let scratchpad = StoredScratchpad {
            id: ScratchpadId::new(),
            title: timestamp_title(now),
            content: String::new(),
            archived: false,
            created_at: now,
            updated_at: now,
            updated_by: updated_by.to_string(),
            version: 1,
        };
        let mut inner = self.inner.lock().expect(LOCK_POISONED);
        inner
            .scratchpads
            .entry(key(root))
            .or_default()
            .push(scratchpad.clone());
        save(&inner)?;
        Ok(scratchpad.info(project_id))
    }

    /// One scratchpad by id, if it exists.
    pub fn get(
        &self,
        project_id: ProjectId,
        root: &Path,
        id: ScratchpadId,
    ) -> Option<ScratchpadInfo> {
        let inner = self.inner.lock().expect(LOCK_POISONED);
        inner
            .scratchpads
            .get(&key(root))
            .and_then(|items| items.iter().find(|s| s.id == id))
            .map(|s| s.info(project_id))
    }

    /// Replace a scratchpad's content, bumping `version` and stamping
    /// `updated_at`/`updated_by`.
    pub fn update_content(
        &self,
        project_id: ProjectId,
        root: &Path,
        id: ScratchpadId,
        content: &str,
        updated_by: &str,
    ) -> CoreResult<ScratchpadInfo> {
        let mut inner = self.inner.lock().expect(LOCK_POISONED);
        let scratchpad = inner
            .scratchpads
            .get_mut(&key(root))
            .and_then(|items| items.iter_mut().find(|s| s.id == id))
            .ok_or(CoreError::ScratchpadNotFound)?;
        scratchpad.content = content.to_string();
        scratchpad.version += 1;
        scratchpad.updated_at = Utc::now();
        scratchpad.updated_by = updated_by.to_string();
        let info = scratchpad.info(project_id);
        save(&inner)?;
        Ok(info)
    }

    /// Revise a scratchpad's title. A blank title falls back to a
    /// timestamp title regenerated from `created_at`.
    pub fn update_title(
        &self,
        project_id: ProjectId,
        root: &Path,
        id: ScratchpadId,
        title: &str,
        updated_by: &str,
    ) -> CoreResult<ScratchpadInfo> {
        let mut inner = self.inner.lock().expect(LOCK_POISONED);
        let scratchpad = inner
            .scratchpads
            .get_mut(&key(root))
            .and_then(|items| items.iter_mut().find(|s| s.id == id))
            .ok_or(CoreError::ScratchpadNotFound)?;
        let title = title.trim();
        scratchpad.title = if title.is_empty() {
            timestamp_title(scratchpad.created_at)
        } else {
            title.to_string()
        };
        scratchpad.updated_at = Utc::now();
        scratchpad.updated_by = updated_by.to_string();
        let info = scratchpad.info(project_id);
        save(&inner)?;
        Ok(info)
    }
}

/// `MM-DD-HH-MM Scratchpad`, e.g. `07-14-09-30 Scratchpad`.
fn timestamp_title(at: DateTime<Utc>) -> String {
    format!("{} Scratchpad", at.format("%m-%d-%H-%M"))
}

fn key(root: &Path) -> String {
    root.to_string_lossy().into_owned()
}

/// Read the map from disk; a missing or corrupt file is an empty store.
fn load(path: &Path) -> ScratchpadMap {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return ScratchpadMap::new();
    };
    serde_json::from_str(&raw).unwrap_or_else(|e| {
        tracing::warn!("scratchpads file is corrupt, starting fresh: {e}");
        ScratchpadMap::new()
    })
}

/// Atomically persist the map: write a temp file, then rename it over the
/// old one so a crash mid-write can never leave a torn file. A store without
/// a path (in-memory) is a no-op.
fn save(inner: &Inner) -> CoreResult<()> {
    let Some(path) = &inner.path else {
        return Ok(());
    };
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(&inner.scratchpads)
        .map_err(|e| CoreError::InvalidInput(format!("failed to encode scratchpads: {e}")))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids() -> (ProjectId, PathBuf) {
        (ProjectId::new(), PathBuf::from("/tmp/fixture-project"))
    }

    #[test]
    fn add_creates_scratchpad_with_timestamp_title() {
        let store = ScratchpadStore::new();
        let (project, root) = ids();

        let added = store.add(project, &root, "User").unwrap();
        assert!(added.title.ends_with("Scratchpad"));
        assert_eq!(added.content, "");
        assert_eq!(added.version, 1);
        assert!(!added.archived);
        assert_eq!(added.updated_by, "User");
    }

    #[test]
    fn update_content_bumps_version_and_updated_at() {
        let store = ScratchpadStore::new();
        let (project, root) = ids();
        let added = store.add(project, &root, "User").unwrap();
        assert_eq!(added.version, 1);

        let updated = store
            .update_content(project, &root, added.id, "hello world", "claude")
            .unwrap();
        assert_eq!(updated.content, "hello world");
        assert_eq!(updated.version, 2);
        assert_eq!(updated.updated_by, "claude");
        assert!(updated.updated_at >= added.updated_at);

        assert!(matches!(
            store.update_content(project, &root, ScratchpadId::new(), "x", "y"),
            Err(CoreError::ScratchpadNotFound)
        ));
    }

    #[test]
    fn update_title_blank_falls_back_to_timestamp_title() {
        let store = ScratchpadStore::new();
        let (project, root) = ids();
        let added = store.add(project, &root, "User").unwrap();
        let original_title = added.title.clone();

        let renamed = store
            .update_title(project, &root, added.id, "  My Notes  ", "User")
            .unwrap();
        assert_eq!(renamed.title, "My Notes");

        let cleared = store
            .update_title(project, &root, added.id, "   ", "User")
            .unwrap();
        assert_eq!(cleared.title, original_title);
    }

    #[test]
    fn list_returns_scratchpads_for_given_project_root() {
        let store = ScratchpadStore::new();
        let project = ProjectId::new();
        let root_a = PathBuf::from("/tmp/fixture-a");
        let root_b = PathBuf::from("/tmp/fixture-b");

        store.add(project, &root_a, "User").unwrap();
        assert_eq!(store.list(project, &root_a).len(), 1);
        assert!(store.list(project, &root_b).is_empty());
    }

    #[test]
    fn get_returns_the_scratchpad_or_none() {
        let store = ScratchpadStore::new();
        let (project, root) = ids();
        let added = store.add(project, &root, "User").unwrap();
        assert_eq!(store.get(project, &root, added.id).unwrap().id, added.id);
        assert!(store.get(project, &root, ScratchpadId::new()).is_none());
    }

    #[test]
    fn save_and_load_round_trips_via_temp_file_rename() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scratchpads.json");
        let (project, root) = ids();

        let store = ScratchpadStore::new();
        store.set_path(file.clone());
        let added = store.add(project, &root, "User").unwrap();
        store
            .update_content(project, &root, added.id, "survive a restart", "User")
            .unwrap();

        let reloaded = ScratchpadStore::new();
        reloaded.set_path(file);
        let listed = reloaded.list(project, &root);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].content, "survive a restart");
        assert_eq!(listed[0].version, 2);
    }

    #[test]
    fn missing_file_loads_empty_store() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scratchpads.json");

        let store = ScratchpadStore::new();
        store.set_path(file);
        let (project, root) = ids();
        assert!(store.list(project, &root).is_empty());
    }

    #[test]
    fn corrupt_file_logs_warning_and_loads_empty() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scratchpads.json");
        std::fs::write(&file, "not json").unwrap();

        let store = ScratchpadStore::new();
        store.set_path(file);
        let (project, root) = ids();
        assert!(store.list(project, &root).is_empty());
    }

    #[test]
    fn list_returns_only_scratchpads_for_given_project_root() {
        let store = ScratchpadStore::new();
        let project = ProjectId::new();
        let root_a = PathBuf::from("/tmp/fixture-c");
        let root_b = PathBuf::from("/tmp/fixture-d");

        store.add(project, &root_a, "User").unwrap();
        store.add(project, &root_a, "User").unwrap();
        store.add(project, &root_b, "User").unwrap();

        assert_eq!(store.list(project, &root_a).len(), 2);
        assert_eq!(store.list(project, &root_b).len(), 1);
    }
}
