-- Migration: Ingest legacy users from re-workspace-db into Better-Auth schema

-- 1. Insert users into Better-Auth 'user' table
INSERT OR IGNORE INTO "user" (
  id,
  name,
  email,
  emailVerified,
  createdAt,
  updatedAt,
  role,
  phone,
  company,
  designation,
  license_number
)
SELECT
  id,
  COALESCE(name, email) AS name,
  LOWER(TRIM(email)) AS email,
  1 AS emailVerified,
  COALESCE(strftime('%s', created_at) * 1000, strftime('%s', 'now') * 1000) AS createdAt,
  strftime('%s', 'now') * 1000 AS updatedAt,
  COALESCE(role, 'salesperson') AS role,
  phone,
  'Prime America Real Estate' AS company,
  CASE
    WHEN role = 'broker' THEN 'Licensed Real Estate Broker'
    WHEN role = 'admin' THEN 'Platform Administrator'
    WHEN role = 'assistant' THEN 'Transaction Coordinator'
    ELSE 'Licensed Real Estate Salesperson'
  END AS designation,
  license_number
FROM users
WHERE email IS NOT NULL AND email != '';

-- 2. Insert credential records into Better-Auth 'account' table for users with existing passwords
INSERT OR IGNORE INTO "account" (
  id,
  accountId,
  providerId,
  userId,
  password,
  createdAt,
  updatedAt
)
SELECT
  'acc_' || id AS id,
  id AS accountId,
  'credential' AS providerId,
  id AS userId,
  password_hash AS password,
  strftime('%s', 'now') * 1000 AS createdAt,
  strftime('%s', 'now') * 1000 AS updatedAt
FROM users
WHERE password_hash IS NOT NULL AND password_hash != '';
