# ADR 009: Listing inquiries connect people and showings

A Listing Inquiry is one tenant-scoped relationship between a canonical CRM Contact and a Listing. A Contact can inquire about several Listings, regardless of their client lifecycle. Each relationship can have several Showing appointments. The Listing page, CRM contact profile, and Listing Inquiries Pool operate on these same records.

Appointments have scheduled, completed, canceled, or no_show status. Rescheduling changes the existing appointment; cancellation retains it. Archiving an inquiry does not archive the Contact. An attendee role distinguishes buyers, renters, and outside agents without creating additional people or changing client lifecycle. Recording interest or a showing does not grant marketing consent.

Creation uses one D1 batch for contact creation where necessary, the unique contact/listing relationship, and the appointment. A client command ID makes appointment retries idempotent. Existing people are matched by email/normalized phone; ambiguous matches require explicit selection. Names alone never merge people. Ordinary users act on assigned contacts; brokers and admins can manage tenant records; assistants inherit their scoped principal.

Migration 056 backfills known contact/listing relationships and connects subsequent source evidence through a database trigger. Source attribution and consent evidence remain in contact_source_links. Historical name-only showing logs stay intact and unlinked rather than guessing identity. Legacy inquiry contacts without a listing remain accessible under contact management in the pool.

Times are stored as UTC instants and entered/displayed in America/New_York. Ambiguous or nonexistent daylight-saving wall times require the user to choose another time.
