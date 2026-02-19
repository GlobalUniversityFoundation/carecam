import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { verifyAuthToken } from "@/lib/jwt";

export const runtime = "nodejs";

const DEFAULT_BUCKET = "storiesrus-d450d.appspot.com";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "secrets",
  "storiesrus-d450d-firebase-adminsdk-iuwd4-fdc0e0c4cd.json",
);
const CHILD_PROFILES_PREFIX = "carecam/child_profiles";
const CHILD_VIDEO_SESSIONS_PREFIX = "carecam/child_video_sessions";

type ChildProfileRecord = {
  center?: string;
};

type ChildVideoSessionRecord = {
  center?: string;
  uploadedAt?: string;
  status?: string;
  durationSeconds?: number | null;
  dominantCategory?: string | null;
  worker?: {
    mergedBehaviorCount?: number;
  };
  __uploadEpoch?: string;
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

function formatSessionDateTime(isoDateTime: string | undefined) {
  if (!isoDateTime) {
    return "-";
  }
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDuration(durationSeconds: number | null | undefined) {
  if (durationSeconds === null || durationSeconds === undefined || !Number.isFinite(durationSeconds)) {
    return "-";
  }
  if (durationSeconds < 60) {
    return `${Math.max(1, Math.round(durationSeconds))} sec`;
  }
  const wholeMinutes = Math.floor(durationSeconds / 60);
  if (wholeMinutes >= 60) {
    const hours = Math.floor(wholeMinutes / 60);
    const minutes = wholeMinutes % 60;
    if (minutes === 0) {
      return `${hours} hour`;
    }
    return `${hours}h ${minutes}m`;
  }
  return `${wholeMinutes} min`;
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
    if (!icdCodeRaw) {
      return NextResponse.json({ message: "ICD code is required." }, { status: 400 });
    }

    const bucket = getBucket();
    const icdKey = normalizeIcdCodeForFile(icdCodeRaw);
    const childFile = bucket.file(`${CHILD_PROFILES_PREFIX}/${icdKey}.json`);
    const [exists] = await childFile.exists();
    if (!exists) {
      return NextResponse.json({ message: "Child profile not found." }, { status: 404 });
    }

    const [childContent] = await childFile.download();
    const child = JSON.parse(childContent.toString("utf8")) as ChildProfileRecord;
    if (child.center?.trim().toLowerCase() !== centerEmail) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    const [sessionFiles] = await bucket.getFiles({
      prefix: `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/`,
    });
    const sessions = await Promise.all(
      sessionFiles
        .filter((file) => !file.name.endsWith("/"))
        .map(async (file) => {
          const [content] = await file.download();
          const parsed = JSON.parse(content.toString("utf8")) as ChildVideoSessionRecord;
          const fileName = path.basename(file.name);
          const uploadEpoch = fileName.endsWith(".json")
            ? fileName.slice(0, -5)
            : "";
          return {
            ...parsed,
            __uploadEpoch: uploadEpoch,
          };
        }),
    );

    const rows = sessions
      .filter((session) => session.center?.trim().toLowerCase() === centerEmail)
      .sort((a, b) => {
        const aTs = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
        const bTs = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
        return bTs - aTs;
      })
      .map((session) => ({
        dateTime: formatSessionDateTime(session.uploadedAt),
        duration: formatDuration(session.durationSeconds),
        durationSeconds:
          session.durationSeconds !== null &&
          session.durationSeconds !== undefined &&
          Number.isFinite(session.durationSeconds)
            ? Number(session.durationSeconds)
            : null,
        dominantCategory: session.dominantCategory?.trim() || "-",
        detectedBehaviorCount:
          session.worker?.mergedBehaviorCount !== undefined &&
          Number.isFinite(session.worker.mergedBehaviorCount)
            ? Number(session.worker.mergedBehaviorCount)
            : null,
        status: session.status?.trim() || "Awaiting",
        details: "VIEW",
        uploadEpoch: session.__uploadEpoch || "",
        uploadedAt: session.uploadedAt || "",
      }));

    return NextResponse.json({ sessions: rows }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sessions.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

