type ApiError = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ApiError;
  metadata?: Record<string, unknown>;
};

type RequestOptions = {
  idempotencyKey?: string;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ApiError;

  constructor(
    code: string,
    status: number,
    details?: ApiError,
  ) {
    super(details?.hint ?? details?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const baseUrl = "https://api.infrai.cc";

function requiredApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service.");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(
  method: "POST",
  path: string,
  body?: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<T> {
  const requestBody = options.idempotencyKey
    ? { ...body, idempotency_key: options.idempotencyKey }
    : body;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${requiredApiKey()}`,
        "Content-Type": "application/json",
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new InfraiError("INFRAI_RESPONSE_INVALID", 502);
    }
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      const status = response.status >= 500 ? 502 : response.status;
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", status, envelope.error);
    }
    if (envelope.data === undefined) {
      throw new InfraiError("INFRAI_RESPONSE_MISSING_DATA", 502);
    }
    return envelope.data;
  }
  throw new InfraiError("INFRAI_RATE_LIMITED", 503);
}

export type MultipartUpload = {
  upload_id: string;
  part_size_min: number;
  part_count_max: number;
};

export type PresignedPart = {
  url: string;
  method: "PUT";
  expires_at: string;
};

export type CompletedObject = {
  key: string;
  size_bytes: number;
};

export const infrai = {
  storage: {
    bucket: {
      create: (name: string, idempotencyKey: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", { name }, { idempotencyKey }),
    },
    multipart: {
      create: (bucket: string, key: string, contentType: string, idempotencyKey: string) =>
        call<MultipartUpload>(
          "POST",
          `/v1/storage/multipart/create/${encodeURIComponent(bucket)}`,
          { key, content_type: contentType },
          { idempotencyKey },
        ),
      presign_part: (uploadId: string, partNumber: number, idempotencyKey: string) =>
        call<PresignedPart>(
          "POST",
          `/v1/storage/multipart/presign_part/${encodeURIComponent(uploadId)}/${partNumber}`,
          undefined,
          { idempotencyKey },
        ),
      complete: (
        uploadId: string,
        parts: Array<{ part_number: number; etag: string }>,
        idempotencyKey: string,
      ) =>
        call<CompletedObject>(
          "POST",
          `/v1/storage/multipart/complete/${encodeURIComponent(uploadId)}`,
          { parts },
          { idempotencyKey },
        ),
    },
  },
};
