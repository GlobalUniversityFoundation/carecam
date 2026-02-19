import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getAuthTokenMaxAgeSeconds, signAuthToken } from "@/lib/jwt";

export const runtime = "nodejs";

const DEFAULT_BUCKET = "storiesrus-d450d.appspot.com";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "secrets",
  "storiesrus-d450d-firebase-adminsdk-iuwd4-fdc0e0c4cd.json",
);
const USERS_PREFIX = "carecam/users";

type SignInBody = {
  email?: string;
  password?: string;
};

type StoredUserRecord = {
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
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

function userFileNameFromEmail(email: string) {
  return `${Buffer.from(email).toString("base64url")}.json`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignInBody;
    const normalizedEmail = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 },
      );
    }

    const bucket = getBucket();
    const userFilePath = `${USERS_PREFIX}/${userFileNameFromEmail(normalizedEmail)}`;
    const userFile = bucket.file(userFilePath);
    const [exists] = await userFile.exists();

    if (!exists) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 },
      );
    }

    const [content] = await userFile.download();
    const userRecord = JSON.parse(content.toString("utf8")) as StoredUserRecord;
    const isPasswordMatch = await bcrypt.compare(password, userRecord.passwordHash);

    if (!isPasswordMatch) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 },
      );
    }

    const token = signAuthToken({ email: normalizedEmail });
    const response = NextResponse.json(
      { message: "Successful sign in.", redirectTo: "/home" },
      { status: 200 },
    );

    response.cookies.set({
      name: "carecam_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: getAuthTokenMaxAgeSeconds(),
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong during sign in.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

