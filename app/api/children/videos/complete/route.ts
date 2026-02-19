import { NextResponse } from "next/server";
import {
  CHILD_VIDEO_SESSIONS_PREFIX,
  getBucket,
  normalizeIcdCodeForFile,
  requireCenterEmail,
  shouldAutoTriggerWorker,
  triggerWorkerFinalizeEvent,
  verifyChildOwnership,
} from "../shared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireCenterEmail();
    if ("error" in auth) return auth.error;
    const centerEmail = auth.centerEmail;

    const body = (await req.json()) as {
      icdCode?: string;
      uploadEpoch?: string;
      storagePath?: string;
      safeName?: string;
      durationSeconds?: number;
      firstFrameHash?: string;
      lastFrameHash?: string;
      mimeType?: string;
    };

    const icdCodeRaw = String(body.icdCode || "").trim();
    const uploadEpoch = String(body.uploadEpoch || "").trim();
    const storagePath = String(body.storagePath || "").trim();
    const safeName = String(body.safeName || "").trim();
    const firstFrameHash = String(body.firstFrameHash || "").trim();
    const lastFrameHash = String(body.lastFrameHash || "").trim();
    const mimeType = String(body.mimeType || "").trim() || "application/octet-stream";
    const durationSecondsRaw = Number(body.durationSeconds);
    const normalizedDuration = Number.isFinite(durationSecondsRaw)
      ? Number(durationSecondsRaw.toFixed(3))
      : null;

    if (!icdCodeRaw || !uploadEpoch || !storagePath || !safeName) {
      return NextResponse.json(
        { message: "Missing required upload completion fields." },
        { status: 400 },
      );
    }

    const icdKey = normalizeIcdCodeForFile(icdCodeRaw);
    const expectedPrefix = `carecam/child_videos/${icdKey}/${uploadEpoch}-`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ message: "Invalid storage path." }, { status: 400 });
    }

    const bucket = getBucket();
    const ownership = await verifyChildOwnership(bucket, icdKey, centerEmail);
    if ("error" in ownership) return ownership.error;

    const uploadedFile = bucket.file(storagePath);
    const [exists] = await uploadedFile.exists();
    if (!exists) {
      return NextResponse.json({ message: "Uploaded video file not found." }, { status: 404 });
    }

    await uploadedFile.setMetadata({
      contentType: mimeType,
      cacheControl: "no-store",
      metadata: {
        childIcdCode: icdCodeRaw,
        center: centerEmail,
        status: "Awaiting",
        uploadedAt: new Date(Number(uploadEpoch) || Date.now()).toISOString(),
        durationSeconds: normalizedDuration !== null ? String(normalizedDuration) : "",
        firstFrameHash,
        lastFrameHash,
      },
    });

    const sessionRecordPath = `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/${uploadEpoch}.json`;
    const sessionFile = bucket.file(sessionRecordPath);
    const [sessionExists] = await sessionFile.exists();
    if (sessionExists) {
      return NextResponse.json({ message: "Session already recorded." }, { status: 200 });
    }

    const uploadedAt = new Date(Number(uploadEpoch) || Date.now()).toISOString();
    await sessionFile.save(
      JSON.stringify(
        {
          childIcdCode: icdCodeRaw,
          center: centerEmail,
          fileName: safeName,
          storagePath,
          status: "Awaiting",
          uploadedAt,
          durationSeconds: normalizedDuration,
          firstFrameHash: firstFrameHash || null,
          lastFrameHash: lastFrameHash || null,
        },
        null,
        2,
      ),
      {
        contentType: "application/json",
        resumable: false,
        metadata: {
          cacheControl: "no-store",
        },
      },
    );

    if (shouldAutoTriggerWorker()) {
      void triggerWorkerFinalizeEvent(bucket.name, storagePath);
    }

    return NextResponse.json(
      {
        message: "Upload complete.",
        fileName: safeName,
        storagePath,
        status: "Awaiting",
        uploadedAt,
        durationSeconds: normalizedDuration,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize upload.";
    return NextResponse.json({ message }, { status: 500 });
  }
}


