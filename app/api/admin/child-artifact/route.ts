import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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
const ALLOWED_PREFIXES = ["carecam/child_video_analysis/"];

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

function isAllowedArtifactPath(targetPath: string) {
  return ALLOWED_PREFIXES.some((prefix) => targetPath.startsWith(prefix));
}

function isAdminTokenValid(token: string | undefined) {
  if (!token) return false;
  try {
    const payload = verifyAuthToken(token);
    return payload.role === "admin" && payload.email === "admin@carecam.co";
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("carecam_admin_token")?.value;
    if (!isAdminTokenValid(token)) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const requestUrl = new URL(req.url);
    const artifactPath = (requestUrl.searchParams.get("path") || "").trim();
    if (!artifactPath) {
      return NextResponse.json({ message: "Artifact path is required." }, { status: 400 });
    }
    if (!isAllowedArtifactPath(artifactPath)) {
      return NextResponse.json({ message: "Artifact path is not allowed." }, { status: 403 });
    }

    const bucket = getBucket();
    const file = bucket.file(artifactPath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ message: "Artifact not found." }, { status: 404 });
    }

    const [content, metadata] = await Promise.all([file.download(), file.getMetadata()]);
    const fileName = artifactPath.split("/").pop() || "artifact";
    const contentType = metadata[0]?.contentType || "application/octet-stream";

    const binaryBody = new Uint8Array(content[0]);
    return new NextResponse(binaryBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch artifact.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

