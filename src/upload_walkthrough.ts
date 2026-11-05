const serviceUrl = process.env.PROPERTY_MEDIA_SERVICE_URL ?? "http://localhost:3000";

const response = await fetch(`${serviceUrl}/media/uploads`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "maintenance_request",
    propertyId: "cedar-court",
    recordId: "repair-1842",
    fileName: "leaking-riser-video.mp4",
    contentType: "video/mp4",
    idempotencyKey: "8d313c4e-e724-4cf2-8428-36f14830a36b",
  }),
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));

export {};
