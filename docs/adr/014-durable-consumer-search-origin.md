# ADR 014: Keep the consumer search origin stable through the brokerage migration

**Status:** Proposed; no production routing or DNS changes authorized by this record.

**Date:** 2026-10-08

The user confirmed that `primeamericarealestate.com` remains the corporate site and `primeamericany.com` remains the consumer site. This domain-role distinction is established; the search/account hostname choices and production implementation below remain proposed. Replacing Placester means replacing the consumer website while preserving the corporate site's separate role.

Propose `search.primeamericany.com` as the canonical consumer search and Listing origin, retaining `/listing/<source>/<source-listing-key>` identity routes through the later Placester replacement. The user prefers a quiet public launch after MLS approval and wants to avoid the Placester editor; an independent subdomain removes editor and reverse-proxy compatibility from the initial launch path while keeping the brokerage brand recognizable. The replacement brokerage site links to or embeds that same search service instead of moving established Listing URLs again. Each public Listing has one complete server-rendered canonical/share page, as required by ADR 013; embedding remains a presentation adapter.

Same-host path routing was considered because it can consolidate the experience under the brokerage website. It requires verified proxied origin/TLS compatibility and path ownership while Placester remains in service. Neither subdirectories nor subdomains guarantee superior rankings. Keeping the independent canonical origin avoids coupling this launch to that unresolved integration, at the cost of a distinct public hostname that needs its own crawlable pages, discovery and monitoring. A later brand/domain change must be a deliberate redirect migration, not a silent rewrite of canonical configuration.

Consumer conversations are private account views of canonical CRM Contacts and Listing Inquiries; professionals work in the existing Workspace with scoped access. Preserve the active identity authority and existing professional/mail domains. Add private communications capabilities behind the gateway rather than making every internal service a new public identity or hostname. The proposed consumer account host is `my.primeamericany.com`; account linking and communications implementation remain separate work.

See the [full domain and communications map](../public-domain-and-communications-map.md) for verified observations, assumptions, phased rollout and remaining prerequisites.
