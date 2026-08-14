# aisales Aerolot Sales configuration

Configures aisales.aerolot.ai as a **SaaS sales CRM** for the Aerolot Sales team.
Companies are dealer accounts. Deals are software pipeline. This is not a lot
inventory board and not Espo Lead convert.

Authoritative field and ICP catalog:

- `packages/db/src/aerolot-sales-config.ts`

Apply script (idempotent):

- `packages/db/prisma/seed-aerolot-sales.ts`

## What this shapes

| Area | Behavior |
| --- | --- |
| Objects | Company, Contact, Deal only. No Lead entity. |
| Pipeline | Fixed SaaS stages: DEMO_BOOKED → QUALIFIED_TO_BUY → DECISION_MAKER_BOUGHT_IN → CONTRACT_SENT, plus CLOSED_WON / CLOSED_LOST / UNQUALIFIED_TO_BUY |
| ICP | Independent used-car dealers and multi-lot groups |
| Home | Existing SaaS dashboard: open pipeline by stage, closed won, win rate, biggest open deals, overdue tasks, recent activity |
| Provision | Company custom fields hold rooftop inputs and Aerolot write-backs. Provision action itself is a separate track |

## Run the seed

From the repo root, with a **local** database only:

```
bun run --filter=@crm/db db:seed:aerolot-sales
```

The script:

1. Sets workspace name/website and WorkspaceProfile (sells / sellsTo / edge)
2. Upserts Company, Contact, and Deal custom field definitions with stable keys
3. Seeds five sample dealership companies with provision-ready field values
4. Seeds one open SaaS deal per dealer (`… — Aerolot SaaS`)

Safe to re-run. It does not delete existing non-seed records. It does not call
the Aerolot dealers provision API.

## Provision field map (ready for T1)

### Standard columns

**Company:** `name`, `city`, `stateCode`, `phone`, `website`

**Contact (owner):** `firstName`, `lastName`, `email`, `phone`

### Custom Company fields (inputs)

| Key | Label | Type |
| --- | --- | --- |
| `street_address` | Street address | TEXT |
| `zip` | ZIP | TEXT |
| `timezone` | Timezone | SELECT (US IANA) |
| `plan_tier` | Plan tier | SELECT Growth / Professional / Enterprise |
| `dealer_slug` | Dealer slug | TEXT |

### Custom Company fields (write-backs)

| Key | Label | Type |
| --- | --- | --- |
| `aerolot_dealer_id` | Aerolot dealer id | TEXT |
| `aerolot_provision_status` | Aerolot provision status | SELECT pending / provisioned / failed / skipped |
| `aerolot_provision_error` | Aerolot provision error | LONG_TEXT |
| `aerolot_portal_url` | Aerolot portal URL | URL |
| `aerolot_provisioned_at` | Aerolot provisioned at | DATE |
| `aerolot_provision_source` | Aerolot provision source | TEXT |

### Seller context (not provision-required)

| Key | Entity | Purpose |
| --- | --- | --- |
| `rooftop_count` | Company | Multi-lot sizing |
| `current_dms_or_crm` | Company | Displacement context |
| `icp_segment` | Company | Independent / Multi-lot / Out of ICP |
| `buying_role` | Contact | Owner / GM / Controller / Ops |
| `primary_module` | Deal | Website / CRM / Voice / Inventory tools / Full suite |

## Smoke checklist

Run after seed on a local workspace.

1. Workspace name is **Aerolot Sales** and website is `https://www.aerolot.ai`.
2. Settings or agent workspace profile shows sells / sellsTo / edge about dealership SaaS.
3. Open any Company → DETAILS shows Street address, ZIP, Timezone, Plan tier, provision status fields.
4. Open a seed dealership (for example Suncoast Motors). Street, ZIP, timezone, and plan tier are filled.
5. Primary contact has phone, email, and Buying role.
6. Home shows **Open pipeline**, **Closed won this month**, open pipeline by stage donut. No inventory or recon widgets.
7. Deals list uses SaaS stages only (Demo booked → Contract sent → Closed).
8. Seed deal names end with **Aerolot SaaS**, not inventory stock numbers.
9. Field keys for provision inputs match `AEROLOT_PROVISION_COMPANY_FIELD_KEYS` in the catalog.
10. No Lead object or Lead nav item exists.

Unit checks (no database):

```
bun run --filter=@crm/db test test/aerolot-sales-config.spec.ts
```

## Out of scope (other workstreams)

- Explicit Company "Provision dealer" action and HMAC/admin auth choice
- aisales ↔ EspoCRM record mirror
- Lifecycle multi-agent Deploy seed (qualify / engage / advance / close)

## Issues known in product (not introduced here)

- Provision is not wired in trycompai-crm. Fields only prepare T1.
- SellerRules model is not in Prisma. ICP policy lives in WorkspaceProfile + field options for now.
