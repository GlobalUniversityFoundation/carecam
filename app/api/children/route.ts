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
  "firebase-service-account.json",
);
const CHILD_PROFILES_PREFIX = "carecam/child_profiles";
const CHILD_PROFILES_BY_CENTER_PREFIX = "carecam/child_profiles_by_center";
const CHILD_VIDEO_SESSIONS_PREFIX = "carecam/child_video_sessions";
const THERAPISTS_PREFIX = "carecam/therapists";

type CreateChildBody = {
  childName?: string;
  dateOfBirth?: string;
  diagnosis?: string;
  assignedTherapistId?: string;
  icdCode?: string;
  insurance?: string;
  countryCode?: string;
  parentContact?: string;
  intakeNotes?: string;
};

type DeleteChildBody = {
  icdCode?: string;
};

type UpdateChildBody = {
  originalIcdCode?: string;
  childName?: string;
  dateOfBirth?: string;
  diagnosis?: string;
  assignedTherapistId?: string;
  icdCode?: string;
  insurance?: string;
  countryCode?: string;
  parentContact?: string;
  intakeNotes?: string;
};

type TherapistRecord = {
  id: string;
  name: string;
  center: string;
};

type ChildProfileRecord = {
  icdCode?: string;
  childName?: string;
  dateOfBirth?: string;
  diagnosis?: string | null;
  assignedTherapistName?: string;
  assignedTherapistId?: string;
  insurance?: string | null;
  intakeNotes?: string | null;
  parentContact?: string;
  createdAt?: string;
  updatedAt?: string;
  center?: string;
};

type ChildVideoSessionRecord = {
  childIcdCode?: string;
  center?: string;
  status?: string;
  uploadedAt?: string;
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

function centerKeyFromEmail(email: string) {
  return Buffer.from(email.trim().toLowerCase()).toString("base64url");
}

function calculateAge(dateOfBirth: string | undefined) {
  if (!dateOfBirth) {
    return "-";
  }
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return "-";
  }
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
    const requestedIcdCode = requestUrl.searchParams.get("icd")?.trim() || "";
    const bucket = getBucket();

    if (requestedIcdCode) {
      const requestedKey = normalizeIcdCodeForFile(requestedIcdCode);
      const file = bucket.file(`${CHILD_PROFILES_PREFIX}/${requestedKey}.json`);
      const [exists] = await file.exists();
      if (!exists) {
        return NextResponse.json({ message: "Child record not found." }, { status: 404 });
      }
      const [content] = await file.download();
      const child = JSON.parse(content.toString("utf8")) as ChildProfileRecord;
      if (child.center?.trim().toLowerCase() !== centerEmail) {
        return NextResponse.json({ message: "Forbidden." }, { status: 403 });
      }

      return NextResponse.json(
        {
          child: {
            icdCode: child.icdCode || "",
            childName: child.childName || "",
            dateOfBirth: child.dateOfBirth || "",
            diagnosis: child.diagnosis || "",
            assignedTherapistId: child.assignedTherapistId || "",
            assignedTherapistName: child.assignedTherapistName || "",
            insurance: child.insurance || "",
            intakeNotes: child.intakeNotes || "",
            parentContact: child.parentContact || "",
          },
        },
        { status: 200 },
      );
    }

    const centerKey = centerKeyFromEmail(centerEmail);
    const [indexedFiles] = await bucket.getFiles({
      prefix: `${CHILD_PROFILES_BY_CENTER_PREFIX}/${centerKey}/`,
    });
    const [files] =
      indexedFiles.length > 0
        ? [indexedFiles]
        : await bucket.getFiles({ prefix: `${CHILD_PROFILES_PREFIX}/` });

    const children = await Promise.all(
      files
        .filter((file) => !file.name.endsWith("/"))
        .map(async (file) => {
          const [content] = await file.download();
          return JSON.parse(content.toString("utf8")) as ChildProfileRecord;
        }),
    );

    const [sessionFiles] = await bucket.getFiles({ prefix: `${CHILD_VIDEO_SESSIONS_PREFIX}/` });
    const sessions = await Promise.all(
      sessionFiles
        .filter((file) => !file.name.endsWith("/"))
        .map(async (file) => {
          const [content] = await file.download();
          return JSON.parse(content.toString("utf8")) as ChildVideoSessionRecord;
        }),
    );

    const latestStatusByIcd = new Map<string, { status: string; uploadedAtTs: number }>();
    sessions
      .filter((session) => session.center?.trim().toLowerCase() === centerEmail)
      .forEach((session) => {
        const icdCode = (session.childIcdCode || "").trim();
        if (!icdCode) {
          return;
        }
        const icdKey = normalizeIcdCodeForFile(icdCode);
        const uploadedAtTs = session.uploadedAt ? Date.parse(session.uploadedAt) : 0;
        const existing = latestStatusByIcd.get(icdKey);
        if (!existing || uploadedAtTs > existing.uploadedAtTs) {
          latestStatusByIcd.set(icdKey, {
            status: session.status?.trim() || "Awaiting",
            uploadedAtTs,
          });
        }
      });

    const rows = children
      .filter((child) => child.center?.trim().toLowerCase() === centerEmail)
      .map((child) => {
        const icdCode = child.icdCode || "";
        const icdKey = normalizeIcdCodeForFile(icdCode);
        const latestStatus = latestStatusByIcd.get(icdKey)?.status;
        return {
          clientName: child.childName || "-",
          age: calculateAge(child.dateOfBirth),
          diagnosis: child.diagnosis?.trim() ? child.diagnosis : "-",
          therapist: child.assignedTherapistName || "-",
          status: latestStatus || "New",
          details: "VIEW",
          icdCode,
        };
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName));

    return NextResponse.json({ children: rows }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load children.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(req: Request) {
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

    const body = (await req.json()) as CreateChildBody;
    const childName = (body.childName || "").trim();
    const dateOfBirth = (body.dateOfBirth || "").trim();
    const diagnosis = (body.diagnosis || "").trim();
    const assignedTherapistId = (body.assignedTherapistId || "").trim();
    const icdCode = (body.icdCode || "").trim();
    const insurance = (body.insurance || "").trim();
    const countryCode = (body.countryCode || "").trim();
    const parentContact = (body.parentContact || "").trim();
    const intakeNotes = (body.intakeNotes || "").trim();

    if (!childName || !dateOfBirth || !assignedTherapistId || !icdCode || !parentContact) {
      return NextResponse.json(
        { message: "Missing required fields." },
        { status: 400 },
      );
    }

    const bucket = getBucket();

    const therapistFilePath = `${THERAPISTS_PREFIX}/${assignedTherapistId}.json`;
    const therapistFile = bucket.file(therapistFilePath);
    const [therapistExists] = await therapistFile.exists();
    if (!therapistExists) {
      return NextResponse.json({ message: "Assigned therapist not found." }, { status: 404 });
    }

    const [therapistRaw] = await therapistFile.download();
    const therapist = JSON.parse(therapistRaw.toString("utf8")) as TherapistRecord;
    if (therapist.center?.trim().toLowerCase() !== centerEmail) {
      return NextResponse.json(
        { message: "Assigned therapist does not belong to this account." },
        { status: 403 },
      );
    }

    const icdFileKey = normalizeIcdCodeForFile(icdCode);
    const childFilePath = `${CHILD_PROFILES_PREFIX}/${icdFileKey}.json`;
    const byCenterFilePath = `${CHILD_PROFILES_BY_CENTER_PREFIX}/${centerKeyFromEmail(centerEmail)}/${icdFileKey}.json`;
    const childFile = bucket.file(childFilePath);
    const [exists] = await childFile.exists();
    if (exists) {
      return NextResponse.json(
        { message: "ICD code already exists.", code: "ICD_EXISTS" },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const childRecord = {
      icdCode,
      childName,
      dateOfBirth,
      diagnosis: diagnosis || null,
      insurance: insurance || null,
      intakeNotes: intakeNotes || null,
      parentContact: `${countryCode}${parentContact}`,
      center: centerEmail,
      assignedTherapistId: therapist.id,
      assignedTherapistName: therapist.name,
      createdAt: now,
      updatedAt: now,
    };

    await childFile.save(JSON.stringify(childRecord, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: {
        cacheControl: "no-store",
      },
    });
    await bucket.file(byCenterFilePath).save(JSON.stringify(childRecord, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: {
        cacheControl: "no-store",
      },
    });

    return NextResponse.json({ message: "Child profile created." }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create child profile.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
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

    const body = (await req.json()) as UpdateChildBody;
    const originalIcdCode = (body.originalIcdCode || "").trim();
    const childName = (body.childName || "").trim();
    const dateOfBirth = (body.dateOfBirth || "").trim();
    const diagnosis = (body.diagnosis || "").trim();
    const assignedTherapistId = (body.assignedTherapistId || "").trim();
    const icdCode = (body.icdCode || "").trim();
    const insurance = (body.insurance || "").trim();
    const countryCode = (body.countryCode || "").trim();
    const parentContact = (body.parentContact || "").trim();
    const intakeNotes = (body.intakeNotes || "").trim();

    if (!originalIcdCode || !childName || !dateOfBirth || !assignedTherapistId || !icdCode || !parentContact) {
      return NextResponse.json({ message: "Missing required fields." }, { status: 400 });
    }

    const bucket = getBucket();
    const therapistFilePath = `${THERAPISTS_PREFIX}/${assignedTherapistId}.json`;
    const therapistFile = bucket.file(therapistFilePath);
    const [therapistExists] = await therapistFile.exists();
    if (!therapistExists) {
      return NextResponse.json({ message: "Assigned therapist not found." }, { status: 404 });
    }

    const [therapistRaw] = await therapistFile.download();
    const therapist = JSON.parse(therapistRaw.toString("utf8")) as TherapistRecord;
    if (therapist.center?.trim().toLowerCase() !== centerEmail) {
      return NextResponse.json(
        { message: "Assigned therapist does not belong to this account." },
        { status: 403 },
      );
    }

    const originalKey = normalizeIcdCodeForFile(originalIcdCode);
    const nextKey = normalizeIcdCodeForFile(icdCode);
    const oldCanonicalPath = `${CHILD_PROFILES_PREFIX}/${originalKey}.json`;
    const nextCanonicalPath = `${CHILD_PROFILES_PREFIX}/${nextKey}.json`;
    const oldByCenterPath = `${CHILD_PROFILES_BY_CENTER_PREFIX}/${centerKeyFromEmail(centerEmail)}/${originalKey}.json`;
    const nextByCenterPath = `${CHILD_PROFILES_BY_CENTER_PREFIX}/${centerKeyFromEmail(centerEmail)}/${nextKey}.json`;

    const oldFile = bucket.file(oldCanonicalPath);
    const [oldExists] = await oldFile.exists();
    if (!oldExists) {
      return NextResponse.json({ message: "Child record not found." }, { status: 404 });
    }

    const [oldContent] = await oldFile.download();
    const existing = JSON.parse(oldContent.toString("utf8")) as ChildProfileRecord;
    if (existing.center?.trim().toLowerCase() !== centerEmail) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    if (nextKey !== originalKey) {
      const [newExists] = await bucket.file(nextCanonicalPath).exists();
      if (newExists) {
        return NextResponse.json(
          { message: "ICD code already exists.", code: "ICD_EXISTS" },
          { status: 409 },
        );
      }
    }

    const now = new Date().toISOString();
    const nextRecord = {
      icdCode,
      childName,
      dateOfBirth,
      diagnosis: diagnosis || null,
      insurance: insurance || null,
      intakeNotes: intakeNotes || null,
      parentContact: `${countryCode}${parentContact}`,
      center: centerEmail,
      assignedTherapistId: therapist.id,
      assignedTherapistName: therapist.name,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };

    await bucket.file(nextCanonicalPath).save(JSON.stringify(nextRecord, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: { cacheControl: "no-store" },
    });
    await bucket.file(nextByCenterPath).save(JSON.stringify(nextRecord, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: { cacheControl: "no-store" },
    });

    if (nextKey !== originalKey) {
      await oldFile.delete();
      const oldByCenterFile = bucket.file(oldByCenterPath);
      const [oldByCenterExists] = await oldByCenterFile.exists();
      if (oldByCenterExists) {
        await oldByCenterFile.delete();
      }
    }

    return NextResponse.json({ message: "Child updated successfully." }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update child.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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

    const body = (await req.json()) as DeleteChildBody;
    const icdCode = (body.icdCode || "").trim();
    if (!icdCode) {
      return NextResponse.json({ message: "ICD code is required." }, { status: 400 });
    }

    const icdFileKey = normalizeIcdCodeForFile(icdCode);
    const childFilePath = `${CHILD_PROFILES_PREFIX}/${icdFileKey}.json`;
    const byCenterFilePath = `${CHILD_PROFILES_BY_CENTER_PREFIX}/${centerKeyFromEmail(centerEmail)}/${icdFileKey}.json`;
    const bucket = getBucket();
    const childFile = bucket.file(childFilePath);
    const [exists] = await childFile.exists();
    if (!exists) {
      return NextResponse.json({ message: "Child record not found." }, { status: 404 });
    }

    const [content] = await childFile.download();
    const existingChild = JSON.parse(content.toString("utf8")) as ChildProfileRecord;
    if (existingChild.center?.trim().toLowerCase() !== centerEmail) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    await childFile.delete();
    const byCenterFile = bucket.file(byCenterFilePath);
    const [byCenterExists] = await byCenterFile.exists();
    if (byCenterExists) {
      await byCenterFile.delete();
    }

    return NextResponse.json({ message: "Child deleted successfully." }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete child.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

