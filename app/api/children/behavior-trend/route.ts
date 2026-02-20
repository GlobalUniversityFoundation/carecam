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
  uploadedAt?: string;
  analysisJsonPath?: string;
};

type AnalysisPayload = {
  behaviors?: Array<{
    behavior?: string;
  }>;
};

type CategoryName =
  | "Aggression"
  | "Disruptive Behaviors"
  | "Motor Stereotypy"
  | "Vocal Stereotypy"
  | "Avoidance & Escape Behaviors";

const CATEGORY_ORDER: CategoryName[] = [
  "Aggression",
  "Disruptive Behaviors",
  "Motor Stereotypy",
  "Vocal Stereotypy",
  "Avoidance & Escape Behaviors",
];

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

function categoryByBehavior(behavior: string): CategoryName {
  const key = behavior.trim().toLowerCase();
  if (
    [
      "hitting the therapist with hand",
      "kicking the therapist with foot",
      "pushing/shoving a person",
      "throwing objects",
    ].includes(key)
  ) {
    return "Aggression";
  }
  if (["non compliance", "out of seat"].includes(key)) {
    return "Disruptive Behaviors";
  }
  if (["hand-flapping repeatedly", "body-rocking", "pulling or twirling hair"].includes(key)) {
    return "Motor Stereotypy";
  }
  if (["crying", "screaming", "whimpering", "echolalia", "laughing"].includes(key)) {
    return "Vocal Stereotypy";
  }
  return "Avoidance & Escape Behaviors";
}

function formatDate(iso: string | undefined) {
  if (!iso) return "-";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dt);
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
    const icdRaw = requestUrl.searchParams.get("icd")?.trim() || "";
    if (!icdRaw) {
      return NextResponse.json({ message: "ICD code is required." }, { status: 400 });
    }

    const bucket = getBucket();
    const icdKey = normalizeIcdCodeForFile(icdRaw);
    const childFile = bucket.file(`${CHILD_PROFILES_PREFIX}/${icdKey}.json`);
    const [exists] = await childFile.exists();
    if (!exists) {
      return NextResponse.json({ message: "Child profile not found." }, { status: 404 });
    }
    const [childRaw] = await childFile.download();
    const child = JSON.parse(childRaw.toString("utf8")) as ChildProfileRecord;
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
          const [raw] = await file.download();
          return JSON.parse(raw.toString("utf8")) as SessionRecord;
        }),
    );

    const trend = await Promise.all(
      sessions
        .filter((session) => session.center?.trim().toLowerCase() === centerEmail)
        .sort((a, b) => {
          const aTs = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
          const bTs = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
          return aTs - bTs;
        })
        .map(async (session) => {
          const counts = CATEGORY_ORDER.reduce(
            (acc, category) => ({ ...acc, [category]: 0 }),
            {} as Record<CategoryName, number>,
          );

          if (session.analysisJsonPath?.trim()) {
            const analysisFile = bucket.file(session.analysisJsonPath.trim());
            const [analysisExists] = await analysisFile.exists();
            if (analysisExists) {
              const [analysisRaw] = await analysisFile.download();
              const analysis = JSON.parse(analysisRaw.toString("utf8")) as AnalysisPayload;
              const behaviors = Array.isArray(analysis.behaviors) ? analysis.behaviors : [];
              for (const row of behaviors) {
                const behaviorName = String(row.behavior || "").trim();
                if (!behaviorName) continue;
                counts[categoryByBehavior(behaviorName)] += 1;
              }
            }
          }

          const total = CATEGORY_ORDER.reduce((sum, category) => sum + counts[category], 0);
          return {
            date: formatDate(session.uploadedAt),
            counts,
            total,
          };
        }),
    );

    return NextResponse.json({ trend }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load behavior trend.";
    return NextResponse.json({ message }, { status: 500 });
  }
}


