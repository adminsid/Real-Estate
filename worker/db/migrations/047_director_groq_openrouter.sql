-- DIRECTOR.EXE — Groq & OpenRouter Free Provider Integrations
-- Adds groq_api_key and openrouter_api_key to director_settings

ALTER TABLE director_settings ADD COLUMN groq_api_key TEXT;
ALTER TABLE director_settings ADD COLUMN openrouter_api_key TEXT;
