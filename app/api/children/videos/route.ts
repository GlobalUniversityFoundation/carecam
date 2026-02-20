import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { verifyAuthToken } from "@/lib/jwt";

export const runtime = "nodejs";

const DEFAULT_BUCKET = "video-analytics-465406.firebasestorage.app";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "secrets",
  "storiesrus-d450d-firebase-adminsdk-iuwd4-fdc0e0c4cd.json",
);
const CHILD_PROFILES_PREFIX = "carecam/child_profiles";
const CHILD_VIDEOS_PREFIX = "carecam/child_videos";
const CHILD_VIDEO_SESSIONS_PREFIX = "carecam/child_video_sessions";

type ChildProfileRecord = {
  center?: string;
};

type ChildVideoSessionRecord = {
  durationSeconds?: number | null;
  firstFrameHash?: string;
  lastFrameHash?: string;
};

function getBucket() {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT_PATH;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!getApps().length) {
    const serviceAccount = serviceAccountJson?.trim()
      ? JSON.parse(serviceAccountJson)
      : (() => {
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

function normalizeIcdCodeForFile(icdCode: string) {
  return icdCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isSupportedVideo(fileName: string, mimeType: string) {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  const isSupportedExt = ext === "mp4" || ext === "avi";
  const isSupportedMime =
    mimeType === "video/mp4" ||
    mimeType === "video/x-msvideo" ||
    mimeType === "video/avi" ||
    mimeType === "application/octet-stream";
  return isSupportedExt && isSupportedMime;
}

function shouldAutoTriggerWorker() {
  if (process.env.WORKER_AUTO_TRIGGER_UPLOADS === "true") {
    return true;
  }
  if (process.env.WORKER_AUTO_TRIGGER_UPLOADS === "false") {
    return false;
  }
  return process.env.NODE_ENV === "development";
}

async function triggerWorkerFinalizeEvent(bucketName: string, objectName: string) {
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

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("carecam_token")?.value;
    if (!token) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    let centerEmail = "";
    try {
      const payload = verifyAuthToken(token);
      centerEmail = payload.email.trim().toLowerCase();
    } catch {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const formData = await req.formData();
    const icdCodeRaw = String(formData.get("icdCode") || "").trim();
    const durationSecondsRaw = String(formData.get("durationSeconds") || "").trim();
    const firstFrameHash = String(formData.get("firstFrameHash") || "").trim();
    const lastFrameHash = String(formData.get("lastFrameHash") || "").trim();
    const file = formData.get("file");

    if (!icdCodeRaw || !(file instanceof File)) {
      return NextResponse.json({ message: "ICD code and file are required." }, { status: 400 });
    }

    if (!isSupportedVideo(file.name, file.type)) {
      return NextResponse.json(
        { message: "Unsupported file type. Use MP4 or AVI." },
        { status: 400 },
      );
    }

    const bucket = getBucket();
    const icdKey = normalizeIcdCodeForFile(icdCodeRaw);
    const childFile = bucket.file(`${CHILD_PROFILES_PREFIX}/${icdKey}.json`);
    const [childExists] = await childFile.exists();
    if (!childExists) {
      return NextResponse.json({ message: "Child profile not found." }, { status: 404 });
    }

    const [childContent] = await childFile.download();
    const child = JSON.parse(childContent.toString("utf8")) as ChildProfileRecord;
    if (child.center?.trim().toLowerCase() !== centerEmail) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const safeName = sanitizeFileName(file.name);
    const uploadEpochMs = Date.now();
    const uploadedAt = new Date(uploadEpochMs).toISOString();
    const status = "Awaiting";
    const durationSeconds = durationSecondsRaw ? Number(durationSecondsRaw) : null;
    const normalizedDuration =
      durationSeconds !== null && Number.isFinite(durationSeconds)
        ? Number(durationSeconds.toFixed(3))
        : null;

    const [existingSessionFiles] = await bucket.getFiles({
      prefix: `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/`,
    });
    if (firstFrameHash && lastFrameHash && normalizedDuration !== null) {
      const existingSessions = await Promise.all(
        existingSessionFiles
          .filter((fileEntry) => !fileEntry.name.endsWith("/"))
          .map(async (fileEntry) => {
            const [content] = await fileEntry.download();
            return JSON.parse(content.toString("utf8")) as ChildVideoSessionRecord;
          }),
      );

      const isDuplicate = existingSessions.some((session) => {
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

      if (isDuplicate) {
        return NextResponse.json(
          { message: "Duplicate video already exists.", code: "DUPLICATE_VIDEO" },
          { status: 409 },
        );
      }
    }

    const destination = `${CHILD_VIDEOS_PREFIX}/${icdKey}/${uploadEpochMs}-${safeName}`;

    await bucket.file(destination).save(fileBuffer, {
      contentType: file.type || "application/octet-stream",
      resumable: false,
      metadata: {
        cacheControl: "no-store",
        metadata: {
          childIcdCode: icdCodeRaw,
          center: centerEmail,
          status,
          uploadedAt,
          durationSeconds: normalizedDuration !== null ? String(normalizedDuration) : "",
          firstFrameHash,
          lastFrameHash,
        },
      },
    });

    const sessionRecordPath = `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/${uploadEpochMs}.json`;
    await bucket.file(sessionRecordPath).save(
      JSON.stringify(
        {
          childIcdCode: icdCodeRaw,
          center: centerEmail,
          fileName: safeName,
          storagePath: destination,
          status,
          uploadedAt,
          durationSeconds: normalizedDuration,
          firstFrameHash: firstFrameHash || null,
          lastFrameHash: lastFrameHash || null,
        },
        null,
        2,
      ),
      {
        contentType: "application/json",
        resumable: false,
        metadata: {
          cacheControl: "no-store",
        },
      },
    );

    if (shouldAutoTriggerWorker()) {
      void triggerWorkerFinalizeEvent(bucket.name, destination);
    }

    return NextResponse.json(
      {
        message: "Upload complete.",
        fileName: safeName,
        storagePath: destination,
        status,
        uploadedAt,
        durationSeconds: normalizedDuration,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

