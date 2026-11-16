-- A cycle-wide maximum may include the initial snapshot's future records.
-- Recovery must use only committed progress in the current traversal.
-- Existing checkpoints start unknown and safely replay from the traversal baseline.
ALTER TABLE feed_state ADD COLUMN replay_watermark TEXT;
