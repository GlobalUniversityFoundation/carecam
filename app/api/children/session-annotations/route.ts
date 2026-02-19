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

type ManualAnnotation = {
  id: string;
  behavior: string;
  startSec: number;
  endSec: number;
  details: string;
  createdAt: string;
};

type SessionRecord = {
  center?: string;
  manualAnnotations?: ManualAnnotation[];
};

function getBucket() {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT_PATH;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET;

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account JSON not found at ${serviceAccountPath}`);
  }

  if (!getApps().length) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
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

  return { bucket, sessionFile, session };
}

function normalizeManualAnnotations(input: unknown): ManualAnnotation[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = String((item as { id?: unknown }).id || "").trim();
      const behavior = String((item as { behavior?: unknown }).behavior || "").trim();
      const startSec = Number((item as { startSec?: unknown }).startSec);
      const endSec = Number((item as { endSec?: unknown }).endSec);
      const details = String((item as { details?: unknown }).details || "").trim();
      const createdAt = String((item as { createdAt?: unknown }).createdAt || "").trim();
      if (!id || !behavior || !Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
        return null;
      }
      return {
        id,
        behavior,
        startSec,
        endSec,
        details: details || `Manually added ${behavior}.`,
        createdAt: createdAt || new Date().toISOString(),
      };
    })
    .filter((item): item is ManualAnnotation => Boolean(item));
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

    return NextResponse.json(
      { manualAnnotations: normalizeManualAnnotations(result.session.manualAnnotations) },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load manual annotations.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      icd?: string;
      uploadEpoch?: string;
      annotation?: Partial<ManualAnnotation>;
    };
    const icdCodeRaw = String(body.icd || "").trim();
    const uploadEpoch = String(body.uploadEpoch || "").trim();
    if (!icdCodeRaw || !uploadEpoch) {
      return NextResponse.json({ message: "ICD code and upload epoch are required." }, { status: 400 });
    }

    const result = await authorizeAndLoadSession(icdCodeRaw, uploadEpoch);
    if ("error" in result) return result.error;

    const annotation = body.annotation || {};
    const id = String(annotation.id || "").trim();
    const behavior = String(annotation.behavior || "").trim();
    const startSec = Number(annotation.startSec);
    const endSec = Number(annotation.endSec);
    const details = String(annotation.details || "").trim() || `Manually added ${behavior}.`;
    if (!id || !behavior || !Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      return NextResponse.json({ message: "Invalid annotation payload." }, { status: 400 });
    }

    const current = normalizeManualAnnotations(result.session.manualAnnotations);
    const next = [
      ...current,
      {
        id,
        behavior,
        startSec,
        endSec,
        details,
        createdAt: new Date().toISOString(),
      },
    ];
    const updated = {
      ...result.session,
      manualAnnotations: next,
    };

    await result.sessionFile.save(JSON.stringify(updated, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: { cacheControl: "no-store" },
    });

    return NextResponse.json({ manualAnnotations: next }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save manual annotation.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { icd?: string; uploadEpoch?: string; id?: string };
    const icdCodeRaw = String(body.icd || "").trim();
    const uploadEpoch = String(body.uploadEpoch || "").trim();
    const id = String(body.id || "").trim();
    if (!icdCodeRaw || !uploadEpoch || !id) {
      return NextResponse.json({ message: "ICD code, upload epoch and id are required." }, { status: 400 });
    }

    const result = await authorizeAndLoadSession(icdCodeRaw, uploadEpoch);
    if ("error" in result) return result.error;

    const current = normalizeManualAnnotations(result.session.manualAnnotations);
    const next = current.filter((item) => item.id !== id);
    const updated = {
      ...result.session,
      manualAnnotations: next,
    };

    await result.sessionFile.save(JSON.stringify(updated, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: { cacheControl: "no-store" },
    });

    return NextResponse.json({ manualAnnotations: next }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete manual annotation.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

