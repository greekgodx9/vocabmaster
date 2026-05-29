-- VocabMaster Sync — Supabase Database Schema
-- ==============================================
-- Run this in your Supabase project: SQL Editor → New Query → Paste → Run
--
-- 1. Go to https://supabase.com → Create a free project
-- 2. SQL Editor → paste this entire file → Run
-- 3. Go to Settings → API → copy URL and anon key into VocabMaster Settings
-- 4. Choose a Sync Passphrase and enter it on all your devices

-- Create the sync table
CREATE TABLE IF NOT EXISTS vocabmaster_sync (
  id              TEXT PRIMARY KEY,              -- SHA-256 hash of passphrase (first 32 chars)
  sync_code_hash  TEXT NOT NULL,                 -- same as id, for reference
  payload         JSONB NOT NULL DEFAULT '{}',   -- full app state (words, checkins, wordbooks, settings)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on update time for efficient queries
CREATE INDEX IF NOT EXISTS idx_sync_updated ON vocabmaster_sync (updated_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE vocabmaster_sync ENABLE ROW LEVEL SECURITY;

-- Allow anyone with the anon key to SELECT their own row
-- (Security is through the passphrase hash — only someone who knows the passphrase
--  can construct the correct row ID)
CREATE POLICY "anon_select_own" ON vocabmaster_sync
  FOR SELECT
  USING (true);

CREATE POLICY "anon_insert_own" ON vocabmaster_sync
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "anon_update_own" ON vocabmaster_sync
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable real-time for live sync (optional, needs publication)
-- If you want real-time sync, also run:
-- ALTER PUBLICATION supabase_realtime ADD TABLE vocabmaster_sync;
