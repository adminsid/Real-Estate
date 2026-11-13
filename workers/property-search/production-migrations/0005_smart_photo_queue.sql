-- Select eligible listing parents in consumer priority order, then probe due media.
-- attempted_at must participate in the lookup: state-only scans revisit entire fresh galleries.
CREATE INDEX media_retry_parent ON listing_media(source,listing_id,state,attempted_at);
CREATE INDEX listing_photo_priority ON listings(
 CASE WHEN status='Active' AND borough IS NOT NULL THEN 0
      WHEN status IN ('Active','Coming Soon','Active Under Contract') THEN 1 ELSE 2 END,
 has_photos,missing_date,on_market_date DESC,id,source,provider_id
) WHERE provider_id IS NOT NULL;
