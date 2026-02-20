import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/jwt";

const DEFAULT_BUCKET = "video-analytics-465406.firebasestorage.app";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "secrets",
  "storiesrus-d450d-firebase-adminsdk-iuwd4-fdc0e0c4cd.json",
);

export const CHILD_PROFILES_PREFIX = "carecam/child_profiles";
export const CHILD_VIDEOS_PREFIX = "carecam/child_videos";
export const CHILD_VIDEO_SESSIONS_PREFIX = "carecam/child_video_sessions";

type ChildProfileRecord = {
  center?: string;
};

type ChildVideoSessionRecord = {
  durationSeconds?: number | null;
  firstFrameHash?: string;
  lastFrameHash?: string;
};

export function getBucket() {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT_PATH;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountJsonB64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64;

  const parseServiceAccountFromEnv = () => {
    const rawSources: string[] = [];
    if (serviceAccountJson?.trim()) {
      rawSources.push(serviceAccountJson.trim());
    }
    if (serviceAccountJsonB64?.trim()) {
      try {
        rawSources.push(Buffer.from(serviceAccountJsonB64.trim(), "base64").toString("utf8").trim());
      } catch {
        // Ignore malformed base64; JSON env var is the primary source.
      }
    }
    if (!rawSources.length) return null;

    let parsed: unknown = null;
    for (const raw of rawSources) {
      const candidates = new Set<string>([raw]);
      if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
      ) {
        candidates.add(raw.slice(1, -1));
      }
      candidates.add(raw.replace(/\\"/g, '"'));

      for (const candidate of candidates) {
        try {
          parsed = JSON.parse(candidate);
        } catch {
          parsed = null;
        }
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            parsed = null;
          }
        }
        if (parsed && typeof parsed === "object") {
          break;
        }
      }

      if (parsed && typeof parsed === "object") {
        break;
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const normalized = parsed as {
      private_key?: string;
      client_email?: string;
      private_key_id?: string;
      [key: string]: unknown;
    };

    if (typeof normalized.private_key === "string") {
      let pk = normalized.private_key;
      // Handle keys pasted with one or more levels of escaping.
      for (let i = 0; i < 3; i += 1) {
        pk = pk.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
      }
      normalized.private_key = pk.trim();
    }
    if (typeof normalized.client_email === "string") {
      normalized.client_email = normalized.client_email.trim();
    }

    if (!normalized.private_key || !normalized.client_email) {
      return null;
    }

    return normalized;
  };

  if (!getApps().length) {
    const serviceAccount = parseServiceAccountFromEnv()
      || (() => {
          if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Service account JSON not found at ${serviceAccountPath}`);
          }
          return JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
        })();

    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: bucketName,
    });
  }

  return getStorage().bucket(bucketName);
}

export function normalizeIcdCodeForFile(icdCode: string) {
  return icdCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function isSupportedVideo(fileName: string, mimeType: string) {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  const isSupportedExt = ext === "mp4" || ext === "avi";
  const isSupportedMime =
    mimeType === "video/mp4" ||
    mimeType === "video/x-msvideo" ||
    mimeType === "video/avi" ||
    mimeType === "application/octet-stream";
  return isSupportedExt && isSupportedMime;
}

export function shouldAutoTriggerWorker() {
  if (process.env.WORKER_AUTO_TRIGGER_UPLOADS === "true") {
    return true;
  }
  if (process.env.WORKER_AUTO_TRIGGER_UPLOADS === "false") {
    return false;
  }
  return process.env.NODE_ENV === "development";
}

export async function triggerWorkerFinalizeEvent(bucketName: string, objectName: string) {
  const endpoint =
    process.env.WORKER_LOCAL_ENDPOINT || "http://127.0.0.1:8080/pubsub/storage-finalize";
  const payload = {
    eventType: "OBJECT_FINALIZE",
    bucket: bucketName,
    name: objectName,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const workerToken = process.env.WORKER_API_TOKEN;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (workerToken) {
    headers.authorization = `Bearer ${workerToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: {
          data: encodedPayload,
          attributes: {
            eventType: "OBJECT_FINALIZE",
            bucketId: bucketName,
            objectId: objectName,
          },
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Worker trigger failed for ${objectName}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function requireCenterEmail() {
  const cookieStore = await cookies();
  const token = cookieStore.get("carecam_token")?.value;
  if (!token) {
    return { error: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) };
  }
  try {
    const payload = verifyAuthToken(token);
    return { centerEmail: payload.email.trim().toLowerCase() };
  } catch {
    return { error: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) };
  }
}

export async function verifyChildOwnership(
  bucket: ReturnType<typeof getBucket>,
  icdKey: string,
  centerEmail: string,
) {
  const childFile = bucket.file(`${CHILD_PROFILES_PREFIX}/${icdKey}.json`);
  const [childExists] = await childFile.exists();
  if (!childExists) {
    return { error: NextResponse.json({ message: "Child profile not found." }, { status: 404 }) };
  }
  const [childContent] = await childFile.download();
  const child = JSON.parse(childContent.toString("utf8")) as ChildProfileRecord;
  if (child.center?.trim().toLowerCase() !== centerEmail) {
    return { error: NextResponse.json({ message: "Forbidden." }, { status: 403 }) };
  }
  return {};
}

export async function checkDuplicateByFingerprint(
  bucket: ReturnType<typeof getBucket>,
  icdKey: string,
  firstFrameHash: string,
  lastFrameHash: string,
  normalizedDuration: number | null,
) {
  const [existingSessionFiles] = await bucket.getFiles({
    prefix: `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/`,
  });
  if (!firstFrameHash || !lastFrameHash || normalizedDuration === null) {
    return false;
  }
  const existingSessions = await Promise.all(
    existingSessionFiles
      .filter((fileEntry) => !fileEntry.name.endsWith("/"))
      .map(async (fileEntry) => {
        const [content] = await fileEntry.download();
        return JSON.parse(content.toString("utf8")) as ChildVideoSessionRecord;
      }),
  );
  return existingSessions.some((session) => {
    const existingDuration =
      session.durationSeconds !== null &&
      session.durationSeconds !== undefined &&
      Number.isFinite(session.durationSeconds)
        ? Number(Number(session.durationSeconds).toFixed(3))
        : null;
    return (
      existingDuration === normalizedDuration &&
      session.firstFrameHash === firstFrameHash &&
      session.lastFrameHash === lastFrameHash
    );
  });
}


