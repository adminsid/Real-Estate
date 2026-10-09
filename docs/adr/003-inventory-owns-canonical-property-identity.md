# ADR 003: Inventory Owns Canonical Property Identity

Inventory owns the canonical Property record because it already receives the most complete address, parcel, unit, and public-source data. A Property represents one separately marketable premises: units on the same parcel remain distinct, while later Listings reuse the Property. Identity is tenant-scoped and uses normalized parcel plus unit when available, falling back to normalized address; other applications reference `property_id` and do not independently invent Property identities.
