# Dealer provision (Company → Aerolot)

Explicit action on a Company that provisions a live Aerolot dealer. Matches the
outcome of Espo Lead convert on sales.aerolot.ai. It is not automatic on company
create.

## Product path

1. Open a Company record.
2. Choose **Provision dealer**.
3. Enter the twelve required fields.
4. Submit. The API validates, POSTs to Aerolot, and writes status on the Company.

### Required fields

- Dealership name
- Owner first name
- Owner last name
- Owner email
- Owner phone
- Street
- City
- State (2-letter US code)
- ZIP
- Plan tier: `Growth`, `Professional`, or `Enterprise`
- Timezone

## Auth and endpoint

Default POST URL:

`https://www.aerolot.ai/api/admin/dealers?source=sales-espo`

This is the same dealers API Espo uses. Headers:

- `Content-Type: application/json`
- `X-Aerolot-Signature: sha256=<hmac_hex>`
- `X-Aerolot-Timestamp: <unix seconds>`
- `Idempotency-Key: aisales:company:{companyId}`

HMAC material is `timestamp + "." + rawBody`, signed with
`AEROLOT_DEALERS_PROVISION_SECRET` (same value as Aerolot
`SALES_ESPO_WEBHOOK_SECRET` when reusing the sales-espo path).

Missing secret removes the capability. The mutation returns unavailable. Boot
does not throw.

## Idempotency

| Layer | Key | Behavior |
| --- | --- | --- |
| CRM | Company row | Status `provisioned` with `aerolotDealerId` skips a second POST |
| Request header | `Idempotency-Key: aisales:company:{id}` | Sent for operators and logs |
| Aerolot body | `espoAccountId: aisales:{companyId}` | Aerolot dedupes on that column for the sales-espo path |

A failed provision stores status `failed` and the error. A later submit retries.

## Company write-back

| Field | Values |
| --- | --- |
| `aerolotDealerId` | Aerolot dealer id |
| `aerolotProvisionStatus` | `pending`, `provisioned`, `failed`, `skipped` |
| `aerolotProvisionError` | Failure text |
| `aerolotPortalUrl` | Portal or invite URL when returned |
| `aerolotProvisionedAt` | Success timestamp |
| `aerolotProvisionSource` | `company_action` |

## Env

- `AEROLOT_DEALERS_PROVISION_SECRET` — required for the action
- `AEROLOT_DEALERS_PROVISION_URL` — optional URL override

## Open captain decision

**HMAC (`source=sales-espo`) vs Clerk platform-admin auth** is still open.

This ship uses HMAC on the existing sales-espo dealers path so aisales matches Espo
without a second dealers API. Trade-offs for captain:

1. **HMAC sales-espo (current)** — reuses secret and idempotency table; body
   `espoAccountId` is namespaced `aisales:{companyId}`.
2. **Clerk admin POST** (no `source`) — needs a platform session or service
   principal in the CRM; not machine-auth like Espo.
3. **Dedicated `source=aisales`** — needs an Aerolot route change and its own
   secret; cleaner identity, more platform work.

Recommend keep HMAC until Aerolot adds a dedicated aisales source.
