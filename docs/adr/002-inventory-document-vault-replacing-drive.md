# ADR 002: Inventory Admin Listing Document Vault (Replacing Google Drive)

## Status
Deprecated / Reverted (2026-08-26)

## Context
Per explicit user request, the proposed Inventory Listing Document Vault was removed from both `re-workspace` (`dev/real-estate`) and `listing-input` (`dev/listing-input`). The listing entry workspace remains structured around Details, Media, and Publishing.

## Decisions

1. **Host Application & UI Placement**:
   The Listing Document Vault is hosted exclusively inside **Inventory Admin (`listing-input`)** at `inventory.primeamericarealestate.com`. In the listing editor, the **Vault** section is positioned alongside **Details**, **Media**, and **Publishing**.

2. **Standardized Vault Taxonomy**:
   - *1. Legal & Listing Agreements*
   - *2. Executed Contracts & Disclosures*
   - *3. Marketing & Media (Photos/Videos/Flyers)*
   - *4. Offers & Buyers*
   - *5. Open House & Sign-in Records*
   - *6. Property Documents*
   Custom subfolders are supported inside categories, preventing Google Drive-style clutter while providing flexibility.

3. **Native Database & R2 Storage (`listing-input`)**:
   - Metadata is stored in `listing-input`'s D1 DB (`listing_input`).
   - Files are stored natively in `listing-input`'s Cloudflare R2 bucket (`MEDIA_BUCKET` / `listing-input-media`).
   - Photographers/videographers receive temporary unauthenticated "Vendor Upload Links" to upload raw files directly into the Vault.
   - Third-party streaming links (Matterport 3D, Frame.io, Vimeo, YouTube, Google Drive raw video archives) can be attached alongside native files.

4. **Tiered Asset Confidentiality & One-Click Media Kits**:
   - Assets are tagged with sensitivity levels: `Internal Only` (contracts, net sheets), `Team Visible`, or `Public/Shareable` (marketing photos, flyers, brochures).
   - Agents can click "Generate Media Kit" to produce an unauthenticated public link containing shareable marketing assets for prospective buyers and co-brokers.

5. **Informational Document Status Badges**:
   The Listing Vault provides visual completion badges without blocking status transitions, as stage-gate compliance enforcement remains handled by the Deals Pipeline workspace app.

## Consequences

### Positive
- Completely replaces Google Drive for listing document storage with zero folder clutter.
- Single source of truth: viewing a listing in Inventory Admin displays all property details, photos, video links, disclosures, and legal paperwork in one place.
- Vendor upload links allow external media teams to deliver multi-GB 4K files directly into the workspace.
- Built-in Media Kit sharing simplifies buyer agent collaboration.

### Considerations
- Document storage consumes Cloudflare R2 bucket storage quota (`re-workspace-assets`).
