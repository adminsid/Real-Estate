-- Personal networks reuse canonical brokerage contacts rather than copying them.
CREATE TABLE IF NOT EXISTS network_memberships (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES network_connections(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, user_id, connection_id)
);
