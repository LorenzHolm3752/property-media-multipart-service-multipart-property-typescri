import assert from "node:assert/strict";
import test from "node:test";
import { mediaObjectKey, StartUploadBody } from "../src/property_media";

test("tenant documents are scoped by property, tenant, and record", () => {
  const input = StartUploadBody.parse({
    kind: "tenant_document",
    propertyId: "elm-house",
    tenantId: "tenant-42",
    recordId: "lease-2026",
    fileName: "signed-lease.pdf",
    contentType: "application/pdf",
    idempotencyKey: "258445a8-4a92-4536-a88d-324ce16be9c1",
  });

  assert.equal(
    mediaObjectKey(input),
    "properties/elm-house/tenant-documents/tenant-42/lease-2026/signed-lease.pdf",
  );
});

test("a tenant document without a tenant is rejected at the request boundary", () => {
  const result = StartUploadBody.safeParse({
    kind: "tenant_document",
    propertyId: "elm-house",
    recordId: "lease-2026",
    fileName: "signed-lease.pdf",
    contentType: "application/pdf",
    idempotencyKey: "258445a8-4a92-4536-a88d-324ce16be9c1",
  });

  assert.equal(result.success, false);
});
