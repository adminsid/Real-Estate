-- Move unstructured notes from contacts into contact_activities
INSERT INTO contact_activities (id, contact_id, tenant_id, user_id, type, title, body, occurred_at, created_at)
SELECT
  'migrated-contact-note-' || id,
  id,
  tenant_id,
  COALESCE(assigned_to, 'system'),
  'note',
  'Migrated Contact Note',
  notes,
  created_at,
  created_at
FROM contacts
WHERE notes IS NOT NULL AND notes != '' AND NOT EXISTS (
  SELECT 1 FROM contact_activities WHERE id = 'migrated-contact-note-' || contacts.id
);

-- Move unstructured notes from transactions into transaction_outcomes
INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, created_at)
SELECT
  'migrated-tx-note-' || id,
  id,
  tenant_id,
  COALESCE(assigned_to, 'system'),
  '[Migrated Note] ' || notes,
  0,
  created_at
FROM transactions
WHERE notes IS NOT NULL AND notes != '' AND NOT EXISTS (
  SELECT 1 FROM transaction_outcomes WHERE id = 'migrated-tx-note-' || transactions.id
);
