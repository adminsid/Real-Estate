# Domain Documentation Layout: Single-Context

This repository follows the **single-context** domain documentation layout.

## Locations

- **`CONTEXT.md`** — The root domain dictionary, system glossary, roles, and architecture principles.
- **`docs/adr/`** — Architectural Decision Records (ADRs), numbered sequentially (`NNN-title.md`).
- **`ROLE_MATRIX.md`** — Permissions and access matrix across all user personas.
- **`COMPONENT_SPEC.md`** — Button-by-button, screen-by-screen feature blueprint.
- **`SPEC.md`** / **`CENTRAL_AUTH_SPEC.md`** — Living feature specifications.

## Rules for Agents

1. **Read Before Writing**: Consult `CONTEXT.md` and relevant ADRs before proposing architectural changes.
2. **Preserve Domain Vocabulary**: Use established terminology (`salesperson`, `broker`, `assistant`, `RESO StandardStatus`) across code and docs.
3. **Record Architectural Decisions**: When an architectural change or standard is established, record it as a new ADR under `docs/adr/`.
