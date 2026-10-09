-- DIRECTOR.EXE — Autonomous Web Intelligence & Multimodal Uploads
-- Adds Tavily search API key storage, web-grounding toggle, and
-- attachment metadata to the settings and projects tables.

-- 1. Settings: Tavily API Key + Web Grounding Toggle
ALTER TABLE director_settings ADD COLUMN tavily_api_key TEXT;
ALTER TABLE director_settings ADD COLUMN enable_web_grounding INTEGER NOT NULL DEFAULT 1;

-- 2. Projects: track attachment count / snapshot for multimodal sessions
ALTER TABLE director_projects ADD COLUMN attachments_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE director_projects ADD COLUMN has_visual_assets INTEGER NOT NULL DEFAULT 0;
