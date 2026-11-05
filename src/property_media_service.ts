import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_storage";
import { CompleteUploadBody, mediaObjectKey, StartUploadBody } from "./property_media";

const bucket = process.env.PROPERTY_MEDIA_BUCKET ?? "property-management-media";
const port = Number(process.env.PORT ?? 3000);

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function routeMatch(pathname: string, expression: RegExp): RegExpMatchArray | null {
  return pathname.match(expression);
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

  if (method === "POST" && pathname === "/media/uploads") {
    const input = StartUploadBody.parse(await readJson(request));
    const key = mediaObjectKey(input);
    const upload = await infrai.storage.multipart.create(
      bucket,
      key,
      input.contentType,
      input.idempotencyKey,
    );
    json(response, 201, { uploadId: upload.upload_id, key, partSizeMin: upload.part_size_min });
    return;
  }

  const part = routeMatch(pathname, /^\/media\/uploads\/([^/]+)\/parts\/([1-9][0-9]*)$/);
  if (method === "POST" && part) {
    const body = CompleteUploadBody.pick({ idempotencyKey: true }).parse(await readJson(request));
    const signed = await infrai.storage.multipart.presign_part(part[1], Number(part[2]), body.idempotencyKey);
    json(response, 200, { uploadUrl: signed.url, method: signed.method, expiresAt: signed.expires_at });
    return;
  }

  const completion = routeMatch(pathname, /^\/media\/uploads\/([^/]+)\/complete$/);
  if (method === "POST" && completion) {
    const body = CompleteUploadBody.parse(await readJson(request));
    const parts = body.parts.map(({ part_number, etag }) => ({ part_number, etag }));
    const object = await infrai.storage.multipart.complete(completion[1], parts, body.idempotencyKey);
    json(response, 200, { state: "stored", key: object.key, sizeBytes: object.size_bytes });
    return;
  }

  json(response, 404, { error: "Route not found" });
}

const bucketReady = infrai.storage.bucket.create(bucket, "property-media-bucket-v1").catch((error: unknown) => {
    if (error instanceof InfraiError && error.status === 409) return;
    throw error;
  });

const server = createServer(async (request, response) => {
  try {
    await bucketReady;
    await handle(request, response);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      json(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      json(response, error.status, { error: error.code, message: error.message });
      return;
    }
    json(response, 500, { error: "Service request failed" });
  }
});

server.listen(port, () => {
  console.log(`Property media service listening on http://localhost:${port}`);
});
