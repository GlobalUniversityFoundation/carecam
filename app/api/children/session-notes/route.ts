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

type SessionRecord = {
  center?: string;
  reviewNotes?: string;
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

async function authorizeAndLoadSession(icdCodeRaw: string, uploadEpoch: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("carecam_token")?.value;
  if (!token) {
    return { error: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) };
  }

  let centerEmail = "";
  try {
    const payload = verifyAuthToken(token);
    centerEmail = payload.email.trim().toLowerCase();
  } catch {
    return { error: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) };
  }

  const bucket = getBucket();
  const icdKey = normalizeIcdCodeForFile(icdCodeRaw);

  const childFile = bucket.file(`${CHILD_PROFILES_PREFIX}/${icdKey}.json`);
  const [childExists] = await childFile.exists();
  if (!childExists) {
    return { error: NextResponse.json({ message: "Child profile not found." }, { status: 404 }) };
  }
  const [childRaw] = await childFile.download();
  const child = JSON.parse(childRaw.toString("utf8")) as ChildProfileRecord;
  if (child.center?.trim().toLowerCase() !== centerEmail) {
    return { error: NextResponse.json({ message: "Forbidden." }, { status: 403 }) };
  }

  const sessionFile = bucket.file(`${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/${uploadEpoch}.json`);
  const [sessionExists] = await sessionFile.exists();
  if (!sessionExists) {
    return { error: NextResponse.json({ message: "Session not found." }, { status: 404 }) };
  }
  const [sessionRaw] = await sessionFile.download();
  const session = JSON.parse(sessionRaw.toString("utf8")) as SessionRecord;
  if (session.center?.trim().toLowerCase() !== centerEmail) {
    return { error: NextResponse.json({ message: "Forbidden." }, { status: 403 }) };
  }

  return { sessionFile, session };
}

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const icdCodeRaw = requestUrl.searchParams.get("icd")?.trim() || "";
    const uploadEpoch = requestUrl.searchParams.get("uploadEpoch")?.trim() || "";
    if (!icdCodeRaw || !uploadEpoch) {
      return NextResponse.json({ message: "ICD code and upload epoch are required." }, { status: 400 });
    }

    const result = await authorizeAndLoadSession(icdCodeRaw, uploadEpoch);
    if ("error" in result) return result.error;

    return NextResponse.json({ reviewNotes: result.session.reviewNotes || "" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load review notes.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { icd?: string; uploadEpoch?: string; reviewNotes?: string };
    const icdCodeRaw = String(body.icd || "").trim();
    const uploadEpoch = String(body.uploadEpoch || "").trim();
    const reviewNotes = String(body.reviewNotes || "").trim();

    if (!icdCodeRaw || !uploadEpoch) {
      return NextResponse.json({ message: "ICD code and upload epoch are required." }, { status: 400 });
    }

    const result = await authorizeAndLoadSession(icdCodeRaw, uploadEpoch);
    if ("error" in result) return result.error;

    const updated = {
      ...result.session,
      reviewNotes,
      reviewNotesUpdatedAt: new Date().toISOString(),
    };

    await result.sessionFile.save(JSON.stringify(updated, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: { cacheControl: "no-store" },
    });

    return NextResponse.json({ message: "Notes saved.", reviewNotes }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save review notes.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

