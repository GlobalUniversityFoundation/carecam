import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
const USERS_PREFIX = "carecam/users";
const THERAPISTS_PREFIX = "carecam/therapists";

type AddTherapistBody = {
  centerEmail?: string;
  therapistName?: string;
};

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

function userFileNameFromEmail(email: string) {
  return `${Buffer.from(email).toString("base64url")}.json`;
}

function isAdminTokenValid(token: string | undefined) {
  if (!token) {
    return false;
  }
  try {
    const payload = verifyAuthToken(token);
    return payload.role === "admin" && payload.email === "admin@carecam.co";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("carecam_admin_token")?.value;
    if (!isAdminTokenValid(token)) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json()) as AddTherapistBody;
    const centerEmail = (body.centerEmail || "").trim().toLowerCase();
    const therapistName = (body.therapistName || "").trim();

    if (!centerEmail || !therapistName) {
      return NextResponse.json(
        { message: "Center email and therapist name are required." },
        { status: 400 },
      );
    }

    const bucket = getBucket();
    const userRecordPath = `${USERS_PREFIX}/${userFileNameFromEmail(centerEmail)}`;
    const [userExists] = await bucket.file(userRecordPath).exists();
    if (!userExists) {
      return NextResponse.json({ message: "Selected user does not exist." }, { status: 404 });
    }

    const [therapistFiles] = await bucket.getFiles({ prefix: `${THERAPISTS_PREFIX}/` });
    const existing = (
      await Promise.all(
        therapistFiles
          .filter((file) => !file.name.endsWith("/"))
          .map(async (file) => {
            const [content] = await file.download();
            return JSON.parse(content.toString("utf8")) as TherapistRecord;
          }),
      )
    ).find(
      (record) =>
        record.center?.trim().toLowerCase() === centerEmail &&
        record.name?.trim().toLowerCase() === therapistName.toLowerCase(),
    );

    if (existing) {
      return NextResponse.json(
        { message: "Therapist already assigned to this user." },
        { status: 409 },
      );
    }

    const therapistRecord = {
      id: crypto.randomUUID(),
      name: therapistName,
      center: centerEmail,
      createdAt: new Date().toISOString(),
    };

    await bucket
      .file(`${THERAPISTS_PREFIX}/${therapistRecord.id}.json`)
      .save(JSON.stringify(therapistRecord, null, 2), {
        contentType: "application/json",
        resumable: false,
        metadata: {
          cacheControl: "no-store",
        },
      });

    return NextResponse.json(
      { message: "Therapist assigned successfully.", therapist: therapistRecord },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add therapist.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

