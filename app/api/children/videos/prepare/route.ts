import { NextResponse } from "next/server";
import {
  checkDuplicateByFingerprint,
  getFirebaseDebugInfo,
  getBucket,
  isSupportedVideo,
  normalizeIcdCodeForFile,
  requireCenterEmail,
  sanitizeFileName,
  verifyChildOwnership,
  CHILD_VIDEOS_PREFIX,
} from "../shared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireCenterEmail();
    if ("error" in auth) return auth.error;
    const centerEmail = auth.centerEmail;

    const body = (await req.json()) as {
      icdCode?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      durationSeconds?: number;
      firstFrameHash?: string;
      lastFrameHash?: string;
    };

    const icdCodeRaw = String(body.icdCode || "").trim();
    const fileName = String(body.fileName || "").trim();
    const mimeType = String(body.mimeType || "").trim() || "application/octet-stream";
    const fileSize = Number(body.fileSize || 0);
    const firstFrameHash = String(body.firstFrameHash || "").trim();
    const lastFrameHash = String(body.lastFrameHash || "").trim();
    const durationSecondsRaw = Number(body.durationSeconds);

    if (!icdCodeRaw || !fileName) {
      return NextResponse.json({ message: "ICD code and file name are required." }, { status: 400 });
    }
    if (!isSupportedVideo(fileName, mimeType)) {
      return NextResponse.json({ message: "Unsupported file type. Use MP4 or AVI." }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 1024 * 1024 * 1024) {
      return NextResponse.json({ message: "File exceeds 1GB limit." }, { status: 400 });
    }

    const bucket = getBucket();
    const icdKey = normalizeIcdCodeForFile(icdCodeRaw);
    const ownership = await verifyChildOwnership(bucket, icdKey, centerEmail);
    if ("error" in ownership) return ownership.error;

    const normalizedDuration = Number.isFinite(durationSecondsRaw)
      ? Number(durationSecondsRaw.toFixed(3))
      : null;

    const isDuplicate = await checkDuplicateByFingerprint(
      bucket,
      icdKey,
      firstFrameHash,
      lastFrameHash,
      normalizedDuration,
    );
    if (isDuplicate) {
      return NextResponse.json(
        { message: "Duplicate video already exists.", code: "DUPLICATE_VIDEO" },
        { status: 409 },
      );
    }

    const uploadEpoch = Date.now();
    const safeName = sanitizeFileName(fileName);
    const storagePath = `${CHILD_VIDEOS_PREFIX}/${icdKey}/${uploadEpoch}-${safeName}`;
    const file = bucket.file(storagePath);
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
    });
    const firebaseDebug = getFirebaseDebugInfo();
    console.info("[upload/prepare] signed URL created", {
      centerEmail,
      icdCode: icdCodeRaw,
      storagePath,
      bucket: bucket.name,
      credentialSource: firebaseDebug.credentialSource,
      serviceAccountEmail: firebaseDebug.serviceAccountEmail,
      serviceAccountProjectId: firebaseDebug.serviceAccountProjectId,
      serviceAccountPath: firebaseDebug.serviceAccountPath,
    });

    return NextResponse.json(
      {
        uploadUrl,
        uploadEpoch: String(uploadEpoch),
        storagePath,
        safeName,
        mimeType,
        debug: {
          bucket: bucket.name,
          credentialSource: firebaseDebug.credentialSource,
          serviceAccountEmail: firebaseDebug.serviceAccountEmail,
          serviceAccountProjectId: firebaseDebug.serviceAccountProjectId,
          serviceAccountPath: firebaseDebug.serviceAccountPath,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare upload.";
    const firebaseDebug = getFirebaseDebugInfo();
    console.error("[upload/prepare] failed", {
      message,
      bucket: firebaseDebug.bucketName,
      credentialSource: firebaseDebug.credentialSource,
      serviceAccountEmail: firebaseDebug.serviceAccountEmail,
      serviceAccountProjectId: firebaseDebug.serviceAccountProjectId,
      serviceAccountPath: firebaseDebug.serviceAccountPath,
    });
    return NextResponse.json(
      {
        message,
        debug: {
          bucket: firebaseDebug.bucketName,
          credentialSource: firebaseDebug.credentialSource,
          serviceAccountEmail: firebaseDebug.serviceAccountEmail,
          serviceAccountProjectId: firebaseDebug.serviceAccountProjectId,
          serviceAccountPath: firebaseDebug.serviceAccountPath,
        },
      },
      { status: 500 },
    );
  }
}


