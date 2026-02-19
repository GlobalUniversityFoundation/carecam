import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { analyzeVideo } from "./analyzer-core.mjs";

const DEFAULT_BUCKET = "storiesrus-d450d.appspot.com";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "secrets",
  "storiesrus-d450d-firebase-adminsdk-iuwd4-fdc0e0c4cd.json",
);

const CHILD_VIDEOS_PREFIX = "carecam/child_videos/";
const CHILD_VIDEO_SESSIONS_PREFIX = "carecam/child_video_sessions";
const CHILD_VIDEO_ANALYSIS_PREFIX = "carecam/child_video_analysis";

function getBucket(bucketNameOverride) {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT_PATH;
  const bucketName = bucketNameOverride || process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!getApps().length) {
    if (serviceAccountJson?.trim()) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket: bucketName,
      });
    } else if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket: bucketName,
      });
    } else {
      // Cloud Run can use Application Default Credentials from its runtime service account.
      initializeApp({
        storageBucket: bucketName,
      });
    }
  }

  return getStorage().bucket(bucketName);
}

function normalizeIcdCodeForFile(icdCode) {
  return icdCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function parseUploadEpochFromObjectPath(objectName) {
  const fileName = objectName.split("/").pop() || "";
  const epochPrefix = fileName.split("-")[0];
  return /^\d+$/.test(epochPrefix) ? epochPrefix : null;
}

async function readJsonFile(bucket, filePath) {
  const [raw] = await bucket.file(filePath).download();
  return JSON.parse(raw.toString("utf8"));
}

async function writeJsonFile(bucket, filePath, value) {
  await bucket.file(filePath).save(JSON.stringify(value, null, 2), {
    contentType: "application/json",
    resumable: false,
    metadata: {
      cacheControl: "no-store",
    },
  });
}

async function resolveSessionRecordPath({
  bucket,
  icdKey,
  objectName,
  uploadEpoch,
}) {
  if (uploadEpoch) {
    const candidate = `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/${uploadEpoch}.json`;
    const [exists] = await bucket.file(candidate).exists();
    if (exists) {
      return candidate;
    }
  }

  const [sessionFiles] = await bucket.getFiles({ prefix: `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/` });
  for (const sessionFile of sessionFiles) {
    if (sessionFile.name.endsWith("/")) continue;
    try {
      const value = await readJsonFile(bucket, sessionFile.name);
      if (value.storagePath === objectName) {
        return sessionFile.name;
      }
    } catch {
      // Skip malformed records while scanning.
    }
  }
  return null;
}

function behaviorSummary(behaviors) {
  const counts = {};
  for (const entry of behaviors) {
    const key = entry.behavior;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export async function processVideoObject({
  bucketName,
  objectName,
  logger = console,
}) {
  if (!objectName || !objectName.startsWith(CHILD_VIDEOS_PREFIX) || objectName.endsWith("/")) {
    return { ignored: true, reason: "unsupported_object" };
  }

  const pathParts = objectName.split("/");
  if (pathParts.length < 4) {
    return { ignored: true, reason: "invalid_object_path" };
  }

  const icdKey = pathParts[2];
  const uploadEpoch = parseUploadEpochFromObjectPath(objectName);
  const bucket = getBucket(bucketName);
  const sourceFile = bucket.file(objectName);
  const [exists] = await sourceFile.exists();
  if (!exists) {
    return { ignored: true, reason: "source_missing" };
  }

  const sessionRecordPath = await resolveSessionRecordPath({
    bucket,
    icdKey,
    objectName,
    uploadEpoch,
  });

  if (!sessionRecordPath) {
    throw new Error(`Session record not found for video ${objectName}`);
  }

  const session = await readJsonFile(bucket, sessionRecordPath);
  if (
    (session.status === "Pending review" || session.status === "Reviewed") &&
    typeof session.analysisJsonPath === "string" &&
    session.analysisJsonPath &&
    typeof session.processedVideoPath === "string" &&
    session.processedVideoPath
  ) {
    return { ignored: true, reason: "already_processed", sessionRecordPath };
  }

  const processingStartedAt = new Date().toISOString();
  await writeJsonFile(bucket, sessionRecordPath, {
    ...session,
    status: "Processing",
    processingStartedAt,
    processingError: null,
  });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "carecam-worker-"));
  const inputPath = path.join(tmpRoot, "input.mp4");
  const outputDir = path.join(tmpRoot, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    await sourceFile.download({ destination: inputPath });
    const analysis = await analyzeVideo({
      videoPath: inputPath,
      outputDir,
      geminiApiKey: process.env.GEMINI_API_KEY,
      logger,
    });

    const safeUploadEpoch = uploadEpoch || String(Date.now());
    const analysisPrefix = `${CHILD_VIDEO_ANALYSIS_PREFIX}/${icdKey}/${safeUploadEpoch}`;
    const finalJsonDestination = `${analysisPrefix}/behaviors_final.json`;
    const outputVideoDestination = `${analysisPrefix}/video_with_behaviors.mp4`;
    const validatedJsonDestination = `${analysisPrefix}/behaviors_validated.json`;
    const rawJsonDestination = `${analysisPrefix}/behaviors_raw.json`;

    await Promise.all([
      bucket.upload(analysis.finalPath, {
        destination: finalJsonDestination,
        metadata: { cacheControl: "no-store", contentType: "application/json" },
      }),
      bucket.upload(analysis.validatedPath, {
        destination: validatedJsonDestination,
        metadata: { cacheControl: "no-store", contentType: "application/json" },
      }),
      bucket.upload(analysis.rawPath, {
        destination: rawJsonDestination,
        metadata: { cacheControl: "no-store", contentType: "application/json" },
      }),
      bucket.upload(analysis.outputVideoPath, {
        destination: outputVideoDestination,
        metadata: { cacheControl: "no-store", contentType: "video/mp4" },
      }),
    ]);

    const existingSession = await readJsonFile(bucket, sessionRecordPath);
    const pendingReviewAt = new Date().toISOString();
    await writeJsonFile(bucket, sessionRecordPath, {
      ...existingSession,
      childIcdCode: existingSession.childIcdCode || icdKey,
      status: "Pending review",
      pendingReviewAt,
      dominantCategory: analysis.dominantCategory || null,
      behaviorSummary: behaviorSummary(analysis.behaviors),
      analysisJsonPath: finalJsonDestination,
      processedVideoPath: outputVideoDestination,
      processingError: null,
      worker: {
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        durationSec: Number(analysis.durationSec.toFixed(3)),
        mergedBehaviorCount: analysis.behaviors.length,
      },
      linkedSourceVideoPath: objectName,
    });

    return {
      ok: true,
      sessionRecordPath,
      analysisJsonPath: finalJsonDestination,
      processedVideoPath: outputVideoDestination,
    };
  } catch (error) {
    const existingSession = await readJsonFile(bucket, sessionRecordPath);
    await writeJsonFile(bucket, sessionRecordPath, {
      ...existingSession,
      status: "Failed",
      failedAt: new Date().toISOString(),
      processingError: String(error?.message || error),
    });
    throw error;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function parsePubSubData(payload) {
  if (!payload?.message?.data) {
    return null;
  }
  try {
    const decoded = Buffer.from(payload.message.data, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function parseStorageEvent(body) {
  const decoded = parsePubSubData(body);
  const attributes = body?.message?.attributes || {};
  const eventType = decoded?.eventType || attributes.eventType || "";
  const bucketName = decoded?.bucket || decoded?.bucketId || attributes.bucketId || "";
  const objectName = decoded?.name || decoded?.objectId || attributes.objectId || "";

  return {
    eventType,
    bucketName,
    objectName,
  };
}

export function isFinalizeEvent(eventType) {
  return String(eventType).toUpperCase().includes("OBJECT_FINALIZE");
}

export function shouldProcessObjectName(objectName) {
  return Boolean(objectName) && objectName.startsWith(CHILD_VIDEOS_PREFIX) && !objectName.endsWith("/");
}

export { normalizeIcdCodeForFile };

