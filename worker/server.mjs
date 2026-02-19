import http from "node:http";
import dotenv from "dotenv";
import {
  isFinalizeEvent,
  parseStorageEvent,
  processVideoObject,
  shouldProcessObjectName,
} from "./process-video-job.mjs";

dotenv.config();

const PORT = Number(process.env.PORT || 8080);
const WORKER_API_TOKEN = process.env.WORKER_API_TOKEN || "";

function json(res, code, payload) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function unauthorized(res) {
  json(res, 401, { message: "Unauthorized." });
}

function verifyAuth(req) {
  if (!WORKER_API_TOKEN) {
    return true;
  }
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token === WORKER_API_TOKEN;
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST" || req.url !== "/pubsub/storage-finalize") {
    json(res, 404, { message: "Not found." });
    return;
  }

  if (!verifyAuth(req)) {
    unauthorized(res);
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString("utf8");
  });

  req.on("end", async () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      const event = parseStorageEvent(parsed);
      if (!isFinalizeEvent(event.eventType)) {
        json(res, 200, { ignored: true, reason: "non_finalize_event" });
        return;
      }

      if (!shouldProcessObjectName(event.objectName)) {
        json(res, 200, { ignored: true, reason: "non_child_video_path" });
        return;
      }

      const result = await processVideoObject({
        bucketName: event.bucketName,
        objectName: event.objectName,
        logger: console,
      });
      json(res, 200, result);
    } catch (error) {
      console.error("Worker failed:", error);
      // Pub/Sub push will retry on non-2xx.
      json(res, 500, {
        message: "Worker failed.",
        error: String(error?.message || error),
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`CareCam worker listening on port ${PORT}`);
});

