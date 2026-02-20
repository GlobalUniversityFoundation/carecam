import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const PROJECT_ROOT = process.cwd();
const DEFAULT_SERVICE_ACCOUNT = path.join(
  PROJECT_ROOT,
  "secrets",
  "storiesrus-d450d-firebase-adminsdk-iuwd4-fdc0e0c4cd.json",
);
const DEFAULT_BUCKET = "video-analytics-465406.firebasestorage.app";
const SOURCE_PREFIX = "therapists/";
const TARGET_PREFIX = "carecam/therapists/";

async function main() {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET;

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account JSON not found: ${serviceAccountPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: bucketName,
    });
  }

  const bucket = getStorage().bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: SOURCE_PREFIX });
  const sourceFiles = files.filter(
    (file) => !file.name.endsWith("/") && !file.name.startsWith(TARGET_PREFIX),
  );

  if (sourceFiles.length === 0) {
    console.log("No root therapists records found to migrate.");
    return;
  }

  for (const source of sourceFiles) {
    const fileName = source.name.slice(SOURCE_PREFIX.length);
    const targetPath = `${TARGET_PREFIX}${fileName}`;
    const [exists] = await bucket.file(targetPath).exists();
    if (exists) {
      console.log(`Skipping existing target: gs://${bucketName}/${targetPath}`);
      continue;
    }
    await source.copy(bucket.file(targetPath));
    console.log(`Copied: gs://${bucketName}/${source.name} -> gs://${bucketName}/${targetPath}`);
  }

  console.log("Therapist migration complete.");
}

main().catch((error) => {
  console.error("Migration failed.");
  console.error(error.message);
  process.exit(1);
});

