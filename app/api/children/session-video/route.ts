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
  "firebase-service-account.json",
);
const CHILD_PROFILES_PREFIX = "carecam/child_profiles";
const CHILD_VIDEO_SESSIONS_PREFIX = "carecam/child_video_sessions";

type ChildProfileRecord = {
  center?: string;
};

type SessionRecord = {
  center?: string;
  processedVideoPath?: string;
};

function getBucket() {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT_PATH;
  const bucketName = (process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET).trim();
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
        // Ignore malformed base64 and try the JSON env value/file path fallback.
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
      [key: string]: unknown;
    };
    if (typeof normalized.private_key === "string") {
      let pk = normalized.private_key;
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

function normalizeIcdCodeForFile(icdCode: string) {
  return icdCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

export async function GET(req: Request) {
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

    const requestUrl = new URL(req.url);
    const icdCodeRaw = requestUrl.searchParams.get("icd")?.trim() || "";
    const uploadEpoch = requestUrl.searchParams.get("uploadEpoch")?.trim() || "";
    if (!icdCodeRaw || !uploadEpoch) {
      return NextResponse.json({ message: "ICD code and upload epoch are required." }, { status: 400 });
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

    const sessionFile = bucket.file(`${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/${uploadEpoch}.json`);
    const [sessionExists] = await sessionFile.exists();
    if (!sessionExists) {
      return NextResponse.json({ message: "Session not found." }, { status: 404 });
    }
    const [sessionContent] = await sessionFile.download();
    const session = JSON.parse(sessionContent.toString("utf8")) as SessionRecord;
    if (session.center?.trim().toLowerCase() !== centerEmail) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }
    if (!session.processedVideoPath?.trim()) {
      return NextResponse.json({ message: "Processed video not available yet." }, { status: 404 });
    }

    const processedVideoFile = bucket.file(session.processedVideoPath.trim());
    const [exists] = await processedVideoFile.exists();
    if (!exists) {
      return NextResponse.json({ message: "Processed video file not found." }, { status: 404 });
    }
    const [signedUrl] = await processedVideoFile.getSignedUrl({
      action: "read",
      expires: Date.now() + 15 * 60 * 1000,
      version: "v4",
    });

    // Redirect to GCS signed URL so the browser can stream with range requests.
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load processed video.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

