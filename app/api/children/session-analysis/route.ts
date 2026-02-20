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
const CHILD_VIDEO_SESSIONS_PREFIX = "carecam/child_video_sessions";

type ChildProfileRecord = {
  center?: string;
};

type SessionRecord = {
  center?: string;
  analysisJsonPath?: string;
};

type AnalysisBehavior = {
  behavior?: string;
  modality?: string;
  startSec?: number;
  endSec?: number;
};

type AnalysisPayload = {
  generatedAt?: string;
  dominantCategory?: string;
  totalBehaviors?: number;
  behaviors?: AnalysisBehavior[];
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
    if (!session.analysisJsonPath?.trim()) {
      return NextResponse.json({ analysis: null }, { status: 200 });
    }

    const analysisFile = bucket.file(session.analysisJsonPath.trim());
    const [analysisExists] = await analysisFile.exists();
    if (!analysisExists) {
      return NextResponse.json({ analysis: null }, { status: 200 });
    }

    const [analysisRaw] = await analysisFile.download();
    const analysis = JSON.parse(analysisRaw.toString("utf8")) as AnalysisPayload;
    return NextResponse.json(
      {
        analysis: {
          generatedAt: analysis.generatedAt || "",
          dominantCategory: analysis.dominantCategory || "",
          totalBehaviors: Number.isFinite(analysis.totalBehaviors) ? Number(analysis.totalBehaviors) : 0,
          behaviors: Array.isArray(analysis.behaviors) ? analysis.behaviors : [],
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load session analysis.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

