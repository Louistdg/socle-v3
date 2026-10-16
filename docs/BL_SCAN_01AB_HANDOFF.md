# BL-SCAN-01A+B

Base: `5744abcfc059844bf8b985968e4f4307f30a078b` (Stock PR #171).

Work originally assigned to IA D and implemented by Workspace SOCLE-V2.

## Behavior

Opening a supplier order adds an original-delivery-document panel. Authorized
users can select a JPEG/PNG/WebP/PDF or use the phone camera. Accepted files
remain byte-for-byte originals in the private documentary registry, linked to
the purchase order and its project. The existing private BLOB limit is 1,800,000
bytes; oversized originals are rejected without compression.

Upload creates only the immutable document, its relations, an `uploaded` scan
session and an audit entry. It does not change the order, create a delivery,
change inventory or request OCR. Confirmation belongs to a future separate lot
and is unavailable here.

## API and access

- `GET /api/purchase-orders/:orderId/delivery-scans`: history and upload capability.
- `POST /api/purchase-orders/:orderId/delivery-scans`: multipart `file` and `operationKey` only.
- `GET /api/purchase-orders/:orderId/delivery-scans/:scanId`: contextual metadata.
- `GET /api/purchase-orders/:orderId/delivery-scans/:scanId/original`: private download.

Upload requires `purchase_orders.view`, `deliveries.receive`, the active tenant
and applicable project scope. Standard WORKER is rejected. TEAM_LEAD needs
explicit purchase/receiving permissions; ACCOUNTING can read with its existing
administrative scope but has no receiving permission by default.

The contextual read endpoint requires purchase-order access, independently of
global Documents management. Generic Documents reads also enforce the order
scope, including history/metadata/download/list. A broad Documents permission
cannot reveal an otherwise inaccessible original. Generic mutation endpoints
and SQL guards preserve scan originals and their order/project linkage.

## Persistence

Migration `0041_delivery_scans.sql` follows unchanged Stock migration 0040.
Tenant/order/checksum uniqueness deduplicates uploads even with new operation
keys. Concurrent losers roll back document/blob/relations/audit writes and return
the existing session. Reusing a recorded operation key with other content or
another order returns 409. No client may choose a document, tenant or owner ID.

## Validation

`tests/bl-scan-01ab.mjs` uses the production SQLite adapter and checks tenant
isolation, permissions, forged IDs, contextual/global reads, immutable originals,
duplicate/racing requests, transaction rollback and unchanged order/inventory.

`tests/browser-bl-scan-01ab.mjs` runs in the Browser Gate and exercises actual
file-input uploads, downloads and deduplication at 1440/375/390/430 px. Changing
tenant clears the original-document panel and discards stale responses.

The build packages the new browser and worker modules. The three existing
migration-contract suites now expect 42 migrations, preserving Stock assertions.
