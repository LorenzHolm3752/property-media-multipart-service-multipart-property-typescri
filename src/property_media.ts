import { z } from "zod";

const safeId = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const safeFileName = z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9_.-]+$/);

const commonUpload = {
  propertyId: safeId,
  recordId: safeId,
  fileName: safeFileName,
  contentType: z.string().trim().min(3).max(120),
  idempotencyKey: z.string().uuid(),
};

export const StartUploadBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("maintenance_request"), ...commonUpload }),
  z.object({ kind: z.literal("tenant_document"), tenantId: safeId, ...commonUpload }),
  z.object({ kind: z.literal("inspection_reminder"), ...commonUpload }),
]);

export const CompleteUploadBody = z.object({
  idempotencyKey: z.string().uuid(),
  parts: z.array(z.object({
    part_number: z.number().int().positive(),
    etag: z.string().trim().min(1),
  })).min(1),
});

export type StartUpload = z.infer<typeof StartUploadBody>;
export type CompleteUpload = z.infer<typeof CompleteUploadBody>;

const folderByKind = {
  maintenance_request: "maintenance-requests",
  tenant_document: "tenant-documents",
  inspection_reminder: "inspection-reminders",
} as const;

export function mediaObjectKey(input: StartUpload): string {
  const tenantSegment = input.kind === "tenant_document" ? `/${input.tenantId}` : "";
  return `properties/${input.propertyId}/${folderByKind[input.kind]}${tenantSegment}/${input.recordId}/${input.fileName}`;
}
