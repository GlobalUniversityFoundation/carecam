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
  childName?: string;
  dateOfBirth?: string;
  diagnosis?: string;
  assignedTherapistName?: string;
};

type ManualAnnotation = {
  id?: string;
  behavior?: string;
  startSec?: number;
  endSec?: number;
  details?: string;
};

type SessionRecord = {
  center?: string;
  uploadedAt?: string;
  durationSeconds?: number | null;
  status?: string;
  dominantCategory?: string;
  analysisJsonPath?: string;
  manualAnnotations?: ManualAnnotation[];
  reviewNotes?: string;
  worker?: {
    mergedBehaviorCount?: number;
  };
};

type AnalysisBehavior = {
  behavior?: string;
  startSec?: number;
  endSec?: number;
  notes?: string;
};

type AnalysisPayload = {
  behaviors?: AnalysisBehavior[];
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

function calculateAge(dateOfBirth: string | undefined) {
  if (!dateOfBirth) return "-";
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "-";
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const dobUtc = new Date(Date.UTC(dob.getFullYear(), dob.getMonth(), dob.getDate()));
  let age = todayUtc.getUTCFullYear() - dobUtc.getUTCFullYear();
  const monthDiff = todayUtc.getUTCMonth() - dobUtc.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && todayUtc.getUTCDate() < dobUtc.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? String(age) : "-";
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

function formatDate(isoDate: string | undefined) {
  if (!isoDate) return "-";
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}

function formatDateDdMmYyyy(isoDate: string | undefined) {
  if (!isoDate) return "-";
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return "-";
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = String(dt.getFullYear());
  return `${day}/${month}/${year}`;
}

function formatDuration(durationSeconds: number | null | undefined) {
  if (durationSeconds === null || durationSeconds === undefined || !Number.isFinite(durationSeconds)) {
    return "-";
  }
  const rounded = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(rounded / 60);
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (remMinutes === 0) return `${hours} hours`;
  return `${hours}h ${remMinutes}m`;
}

function formatTimeRange(startSec: number, endSec: number) {
  const safeStart = Math.max(0, Math.floor(startSec));
  const safeEnd = Math.max(safeStart, Math.floor(endSec));
  const fmt = (value: number) => {
    const mins = Math.floor(value / 60);
    const secs = value % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };
  return `${fmt(safeStart)}-${fmt(safeEnd)}`;
}

async function loadAnalysisBehaviors(
  bucket: ReturnType<typeof getStorage>["bucket"] extends (...args: never[]) => infer R ? R : never,
  analysisJsonPath: string | undefined,
) {
  if (!analysisJsonPath?.trim()) return [] as AnalysisBehavior[];
  const analysisFile = bucket.file(analysisJsonPath.trim());
  const [exists] = await analysisFile.exists();
  if (!exists) return [] as AnalysisBehavior[];
  const [raw] = await analysisFile.download();
  const parsed = JSON.parse(raw.toString("utf8")) as AnalysisPayload;
  return Array.isArray(parsed.behaviors) ? parsed.behaviors : [];
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
    const uploadEpoch = requestUrl.searchParams.get("uploadEpoch")?.trim() || "";
    if (!icdRaw || !uploadEpoch) {
      return NextResponse.json({ message: "ICD code and upload epoch are required." }, { status: 400 });
    }

    const bucket = getBucket();
    const icdKey = normalizeIcdCodeForFile(icdRaw);

    const childFile = bucket.file(`${CHILD_PROFILES_PREFIX}/${icdKey}.json`);
    const [childExists] = await childFile.exists();
    if (!childExists) {
      return NextResponse.json({ message: "Child profile not found." }, { status: 404 });
    }
    const [childRaw] = await childFile.download();
    const child = JSON.parse(childRaw.toString("utf8")) as ChildProfileRecord;
    if (child.center?.trim().toLowerCase() !== centerEmail) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    const [files] = await bucket.getFiles({ prefix: `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/` });
    const sessionPairs = await Promise.all(
      files
        .filter((f) => !f.name.endsWith("/"))
        .map(async (file) => {
          const fileName = path.basename(file.name);
          const epoch = fileName.endsWith(".json") ? fileName.slice(0, -5) : "";
          const [raw] = await file.download();
          const session = JSON.parse(raw.toString("utf8")) as SessionRecord;
          return { epoch, session };
        }),
    );

    const authorizedSessions = sessionPairs
      .filter((pair) => pair.session.center?.trim().toLowerCase() === centerEmail)
      .sort((a, b) => {
        const aTs = a.session.uploadedAt ? Date.parse(a.session.uploadedAt) : Number(a.epoch || 0);
        const bTs = b.session.uploadedAt ? Date.parse(b.session.uploadedAt) : Number(b.epoch || 0);
        return aTs - bTs;
      });

    const current = authorizedSessions.find((pair) => pair.epoch === uploadEpoch);
    if (!current) {
      return NextResponse.json({ message: "Session not found." }, { status: 404 });
    }

    const currentDetected = await loadAnalysisBehaviors(bucket, current.session.analysisJsonPath);
    const currentManual = Array.isArray(current.session.manualAnnotations)
      ? current.session.manualAnnotations
      : [];

    const behaviorLog = [
      ...currentDetected.map((item, index) => {
        const behavior = String(item.behavior || "").trim();
        const startSec = Number(item.startSec);
        const endSec = Number(item.endSec);
        if (!behavior || !Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
        return {
          id: `d-${index}`,
          timestamp: formatTimeRange(startSec, endSec),
          behavior,
          category: categoryByBehavior(behavior),
          details: String(item.notes || "").trim() || `${behavior} detected in this interval.`,
        };
      }),
      ...currentManual.map((item, index) => {
        const behavior = String(item.behavior || "").trim();
        const startSec = Number(item.startSec);
        const endSec = Number(item.endSec);
        if (!behavior || !Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
        return {
          id: `m-${index}`,
          timestamp: formatTimeRange(startSec, endSec),
          behavior,
          category: categoryByBehavior(behavior),
          details: String(item.details || "").trim() || `Manually added ${behavior}.`,
        };
      }),
    ]
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const currentCategoryCounts = CATEGORY_ORDER.reduce(
      (acc, category) => ({ ...acc, [category]: 0 }),
      {} as Record<CategoryName, number>,
    );
    const behaviorByCategory = CATEGORY_ORDER.reduce(
      (acc, category) => ({ ...acc, [category]: {} as Record<string, number> }),
      {} as Record<CategoryName, Record<string, number>>,
    );
    for (const row of behaviorLog) {
      currentCategoryCounts[row.category] += 1;
      behaviorByCategory[row.category][row.behavior] = (behaviorByCategory[row.category][row.behavior] || 0) + 1;
    }

    const trend = await Promise.all(
      authorizedSessions.map(async (pair) => {
        const detected = await loadAnalysisBehaviors(bucket, pair.session.analysisJsonPath);
        const perCategory = CATEGORY_ORDER.reduce(
          (acc, category) => ({ ...acc, [category]: 0 }),
          {} as Record<CategoryName, number>,
        );
        for (const behavior of detected) {
          const name = String(behavior.behavior || "").trim();
          if (!name) continue;
          perCategory[categoryByBehavior(name)] += 1;
        }
        const total = CATEGORY_ORDER.reduce((sum, category) => sum + perCategory[category], 0);
        return {
          date: formatDateDdMmYyyy(
            pair.session.uploadedAt || (pair.epoch ? new Date(Number(pair.epoch)).toISOString() : ""),
          ),
          isoDate: pair.session.uploadedAt || "",
          counts: perCategory,
          total,
        };
      }),
    );

    const currentIndex = authorizedSessions.findIndex((pair) => pair.epoch === uploadEpoch);
    const previousTotals = trend.slice(Math.max(0, currentIndex - 7), currentIndex).map((row) => row.total);
    let sessionComparison: {
      changePercent: number;
      label: string;
      baselineSessionCount: number;
    } | null = null;
    if (previousTotals.length > 0) {
      const baseline = previousTotals.reduce((sum, value) => sum + value, 0) / previousTotals.length;
      const currentTotal = trend[currentIndex]?.total || 0;
      const changePercent = baseline > 0 ? ((currentTotal - baseline) / baseline) * 100 : 0;
      sessionComparison = {
        changePercent: Number(changePercent.toFixed(1)),
        label:
          changePercent >= 0
            ? "Slight increase in overall frequency"
            : "Slight decrease in overall frequency",
        baselineSessionCount: previousTotals.length,
      };
    }

    const dominantCategoryFromCounts = CATEGORY_ORDER.slice().sort(
      (a, b) => currentCategoryCounts[b] - currentCategoryCounts[a],
    )[0];

    return NextResponse.json(
      {
        report: {
          childName: child.childName?.trim() || icdRaw,
          age: calculateAge(child.dateOfBirth),
          diagnosis: child.diagnosis?.trim() || "undiagnosed",
          therapistName: child.assignedTherapistName?.trim() || "-",
          sessionDate: formatDate(current.session.uploadedAt || new Date(Number(uploadEpoch)).toISOString()),
          durationText: formatDuration(current.session.durationSeconds),
          sessionId: `SES-${uploadEpoch}`,
          reviewNotes: String(current.session.reviewNotes || "").trim(),
          totalBehaviorInstances: behaviorLog.length,
          dominantCategory: current.session.dominantCategory?.trim() || dominantCategoryFromCounts,
          aiDetectedCount: currentDetected.length,
          therapistReviewedCount: currentManual.length,
          sessionComparison,
          trend,
          currentCategoryCounts,
          behaviorByCategory,
          behaviorLog,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate export report data.";
    return NextResponse.json({ message }, { status: 500 });
  }
}


