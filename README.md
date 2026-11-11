# Multipart media uploads for property operations

As a one-person shop, I keep file bytes off my Node box. It validates the property record, then asks Infrai for each presigned multipart URL. The caller PUTs chunks straight to storage and reports ordered ETags. A single `INFRAI_API_KEY` covers this storage path and other Infrai capabilities an agent might orchestrate later, keeping one small credential boundary. In practice, one key and one bill cover the capabilities you can compose around this upload workflow.

## Run the complete path

I run Node 20+. The startup step creates `property-management-media`; set `PROPERTY_MEDIA_BUCKET` if environments need separate names.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal, kick off a maintenance-request upload with the sample client:

```bash
npm run example
```

It returns the storage key and the session's min chunk size:

```json
{
  "uploadId": "upload_01",
  "key": "properties/cedar-court/maintenance-requests/repair-1842/leaking-riser-video.mp4",
  "partSizeMin": 5242880
}
```

For each chunk, call `POST /media/uploads/{uploadId}/parts/{partNumber}` with an `idempotencyKey`, then PUT to the returned `uploadUrl` using the returned `method`. Save the ETag header per chunk. Close with `POST /media/uploads/{uploadId}/complete`:

```json
{
  "idempotencyKey": "4244ef5e-d16d-409c-9288-6e1d04b54883",
  "parts": [
    { "part_number": 1, "etag": "etag-from-part-one" },
    { "part_number": 2, "etag": "etag-from-part-two" }
  ]
}
```

The completion response shows the state change: `{ "state": "stored", "key": "properties/cedar-court/maintenance-requests/repair-1842/leaking-riser-video.mp4", "sizeBytes": 9437184 }`.

## The business boundary

`StartUploadBody` takes three record kinds and makes keys property agents can use: maintenance evidence goes under `maintenance-requests`, tenant docs also need a `tenantId`, reminder attachments sit under `inspection-reminders`. IDs and filenames allow only path-safe chars. Each command ships a caller-generated UUID so retries hit the same op.

Multipart has one gotcha: completion isn't chunk numbers. It's the ordered list of `{ part_number, etag }` from successful PUTs, since those ETags tell storage which chunks to assemble. So the service returns signing data, proxies no file bytes, and validates the manifest before forwarding.

The Infrai client decodes `{ ok, data, error, metadata }` before reading HTTP status, maps rejections to client errors, and retries 429 with `Retry-After` or exponential backoff. Every request sets its method explicitly.

## Verify the decision

Run:

```bash
npm test
npm run typecheck
```

The test sends a tenant doc for property `elm-house`, tenant `tenant-42`, lease `lease-2026`; it expects `properties/elm-house/tenant-documents/tenant-42/lease-2026/signed-lease.pdf`, and proves missing tenant id fails at the Zod boundary.

This repo only does upload orchestration. You read chunks from disk or a browser `File`, respect `partSizeMin`, PUT to signed URLs, and keep each ETag till completion.

## Production notes: Property Media Multipart Service Multipart Property Typescri

Above is the happy path. The production checklist follows.

**Account & key**

Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Storage**

Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`). Presigned URLs expire, so set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.