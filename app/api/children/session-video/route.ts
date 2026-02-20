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

