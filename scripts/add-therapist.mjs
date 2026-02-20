import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const PROJECT_ROOT = process.cwd();
const DEFAULT_SERVICE_ACCOUNT = path.join(
  PROJECT_ROOT,
  "secrets",
  "firebase-service-account.json",
);
const DEFAULT_BUCKET = "video-analytics-465406.firebasestorage.app";
const USERS_PREFIX = "carecam/users";
const THERAPISTS_PREFIX = "carecam/therapists";

const therapistName = process.env.THERAPIST_NAME || "Dr. Olivia Benett";
const centerEmailRaw =
  process.env.CENTER_EMAIL || "kamaladityamadakasira@gmail.com";
const centerEmail = centerEmailRaw.trim().toLowerCase();

function userFileNameFromEmail(email) {
  return `${Buffer.from(email).toString("base64url")}.json`;
}

async function main() {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET;

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account JSON not found: ${serviceAccountPath}`);
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  );

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: bucketName,
    });
  }

  const bucket = getStorage().bucket(bucketName);

  const userRecordPath = `${USERS_PREFIX}/${userFileNameFromEmail(centerEmail)}`;
  const userRecordFile = bucket.file(userRecordPath);
  const [userExists] = await userRecordFile.exists();
  if (!userExists) {
    throw new Error(
      `Cannot add therapist: no user found for email "${centerEmail}" in ${USERS_PREFIX}.`,
    );
  }

  const therapistId = crypto.randomUUID();
  const therapistRecord = {
    id: therapistId,
    name: therapistName,
    center: centerEmail,
    createdAt: new Date().toISOString(),
  };

  const destination = `${THERAPISTS_PREFIX}/${therapistId}.json`;
  await bucket.file(destination).save(JSON.stringify(therapistRecord, null, 2), {
    contentType: "application/json",
    resumable: false,
    metadata: {
      cacheControl: "no-store",
    },
  });

  console.log("Therapist added successfully.");
  console.log(`Bucket: gs://${bucketName}`);
  console.log(`File: gs://${bucketName}/${destination}`);
  console.log(JSON.stringify(therapistRecord, null, 2));
}

main().catch((error) => {
  console.error("Add therapist failed.");
  console.error(error.message);
  process.exit(1);
});

