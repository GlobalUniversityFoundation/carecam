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
const THERAPISTS_PREFIX = "carecam/therapists";

type TherapistRecord = {
  id: string;
  name: string;
  center: string;
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

export async function GET() {
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

    const bucket = getBucket();
    const [files] = await bucket.getFiles({ prefix: `${THERAPISTS_PREFIX}/` });

    const therapists = (
      await Promise.all(
        files
          .filter((file) => !file.name.endsWith("/"))
          .map(async (file) => {
            const [content] = await file.download();
            const parsed = JSON.parse(content.toString("utf8")) as TherapistRecord;
            return parsed;
          }),
      )
    )
      .filter((therapist) => therapist.center?.trim().toLowerCase() === centerEmail)
      .map((therapist) => ({ id: therapist.id, name: therapist.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ therapists }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load therapists.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

