ALTER TABLE contacts ADD COLUMN normalized_phone TEXT;
UPDATE contacts SET normalized_phone = (
 WITH RECURSIVE digits(rest, value) AS (
  SELECT COALESCE(phone,''), '' UNION ALL
  SELECT substr(rest,2), value || CASE WHEN substr(rest,1,1) GLOB '[0-9]' THEN substr(rest,1,1) ELSE '' END
  FROM digits WHERE rest <> ''
 ) SELECT NULLIF(value,'') FROM digits WHERE rest = ''
);
CREATE INDEX idx_contacts_normalized_phone ON contacts(tenant_id, normalized_phone);
CREATE TRIGGER contacts_phone_insert AFTER INSERT ON contacts BEGIN
 UPDATE contacts SET normalized_phone = (
  WITH RECURSIVE digits(rest,value) AS (
   SELECT COALESCE(NEW.phone,''), '' UNION ALL
   SELECT substr(rest,2), value || CASE WHEN substr(rest,1,1) GLOB '[0-9]' THEN substr(rest,1,1) ELSE '' END
   FROM digits WHERE rest <> ''
  ) SELECT NULLIF(value,'') FROM digits WHERE rest = ''
 ) WHERE id = NEW.id;
END;
CREATE TRIGGER contacts_phone_update AFTER UPDATE OF phone ON contacts BEGIN
 UPDATE contacts SET normalized_phone = (
  WITH RECURSIVE digits(rest,value) AS (
   SELECT COALESCE(NEW.phone,''), '' UNION ALL
   SELECT substr(rest,2), value || CASE WHEN substr(rest,1,1) GLOB '[0-9]' THEN substr(rest,1,1) ELSE '' END
   FROM digits WHERE rest <> ''
  ) SELECT NULLIF(value,'') FROM digits WHERE rest = ''
 ) WHERE id = NEW.id;
END;
