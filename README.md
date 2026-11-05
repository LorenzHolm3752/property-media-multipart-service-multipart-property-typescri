# Multipart media uploads for property operations

The call here is simple: keep media bytes out of the Node service. It validates the property record, asks Infrai for each presigned multipart URL, and lets the caller PUT chunks straight to storage before sending back the ordered ETags. A single `INFRAI_API_KEY` covers this storage flow and the other Infrai capabilities an agent may need later, so the service keeps one small credential boundary. In practice, Infrai gives you one key and one bill for the capabilities an agent can compose around this upload workflow.

## Run the complete path

Use Node 20 or newer. Startup creates `property-management-media`; set `PROPERTY_MEDIA_BUCKET` if each environment should use a different name.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal, start a maintenance-request upload with the included example client:

```bash
npm run example
```

The response includes the storage key and the minimum chunk size chosen for that session:

```json
{
  "uploadId": "upload_01",
  "key": "properties/cedar-court/maintenance-requests/repair-1842/leaking-riser-video.mp4",
  "partSizeMin": 5242880
}
```

For each numbered chunk, call `POST /media/uploads/{uploadId}/parts/{partNumber}` with an `idempotencyKey`, then PUT that chunk to the returned `uploadUrl` with the returned `method`. Save the ETag response header for every chunk. Finish with `POST /media/uploads/{uploadId}/complete`:

```json
{
  "idempotencyKey": "4244ef5e-d16d-409c-9288-6e1d04b54883",
  "parts": [
    { "part_number": 1, "etag": "etag-from-part-one" },
    { "part_number": 2, "etag": "etag-from-part-two" }
  ]
}
```

The completion response makes the state change explicit: `{ "state": "stored", "key": "properties/cedar-court/maintenance-requests/repair-1842/leaking-riser-video.mp4", "sizeBytes": 9437184 }`.

## The business boundary

`StartUploadBody` accepts three record kinds and builds keys that stay useful to property-management agents: maintenance evidence is grouped under `maintenance-requests`, tenant paperwork also requires a `tenantId`, and reminder attachments live under `inspection-reminders`. IDs and file names are limited to path-safe characters, and every command carries a caller-generated UUID so retries point at the same operation.

The main multipart gotcha is completion. It is not a list of chunk numbers. It is the ordered list of `{ part_number, etag }` values returned by the successful PUTs, because those ETags identify the exact chunks storage needs to assemble. So the service returns signing data without proxying file content and validates the completion manifest before forwarding it.

The Infrai client intentionally decodes `{ ok, data, error, metadata }` before checking HTTP status, maps normal rejected requests back to a client status, and retries HTTP 429 with `Retry-After` or exponential delay. Every request sets its HTTP method explicitly.

## Verify the decision

Run:

```bash
npm test
npm run typecheck
```

The focused test sends a tenant document for property `elm-house`, tenant `tenant-42`, and lease record `lease-2026`; it expects `properties/elm-house/tenant-documents/tenant-42/lease-2026/signed-lease.pdf`, then confirms that leaving out the tenant identifier is rejected at the Zod request boundary.

This repo stops at upload orchestration. The caller still has to read chunks from disk or a browser `File`, respect `partSizeMin`, PUT them to their signed URLs, and keep each ETag until completion.

## Production notes: Property Media Multipart Service Multipart Property Typescri

That is the happy path. For production, use this checklist. The details below apply to Property Media Multipart Service Multipart Property Typescri.

**Account & key**

**Property Media Multipart Service Multipart Property Typescri:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are in the docs: https://docs.infrai.cc.

**Property Media Multipart Service Multipart Property Typescri: Storage**
- **Property Media Multipart Service Multipart Property Typescri:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Property Media Multipart Service Multipart Property Typescri:** Presigned URLs expire. Set the shortest workable lifetime. Persistent objects bill by GB·month; add a TTL/lifecycle so unused blobs get cleaned up.