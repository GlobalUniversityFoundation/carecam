import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

export const runtime = "nodejs";

const DEFAULT_BUCKET = "storiesrus-d450d.appspot.com";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "secrets",
  "storiesrus-d450d-firebase-adminsdk-iuwd4-fdc0e0c4cd.json",
);
const USERS_PREFIX = "carecam/users";

type SignUpBody = {
  email?: string;
  password?: string;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignUpBody;
    const normalizedEmail = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ message: "Invalid email address." }, { status: 400 });
    }

    const bucket = getBucket();
    const userFilePath = `${USERS_PREFIX}/${userFileNameFromEmail(normalizedEmail)}`;
    const userFile = bucket.file(userFilePath);
    const [exists] = await userFile.exists();

    if (exists) {
      return NextResponse.json(
        { message: "User with email already exists.", code: "EMAIL_EXISTS" },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    const userRecord = {
      email: normalizedEmail,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    await userFile.save(JSON.stringify(userRecord, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: {
        cacheControl: "no-store",
      },
    });

    return NextResponse.json({ message: "Successful sign up." }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong during sign up.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

