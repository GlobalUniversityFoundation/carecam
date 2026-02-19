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
const DEFAULT_BUCKET = "storiesrus-d450d.appspot.com";
const SOURCE_PREFIX = "carecam/child_profiles/";
const TARGET_PREFIX = "carecam/child_profiles_by_center/";

function centerKeyFromEmail(email) {
  return Buffer.from(email.trim().toLowerCase()).toString("base64url");
}

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
    console.log("No child profiles found to index.");
    return;
  }

  for (const source of sourceFiles) {
    const [content] = await source.download();
    const record = JSON.parse(content.toString("utf8"));
    const center = typeof record.center === "string" ? record.center.trim().toLowerCase() : "";
    if (!center) {
      console.log(`Skipping without center: gs://${bucketName}/${source.name}`);
      continue;
    }

    const fileName = source.name.slice(SOURCE_PREFIX.length);
    const targetPath = `${TARGET_PREFIX}${centerKeyFromEmail(center)}/${fileName}`;
    await bucket.file(targetPath).save(JSON.stringify(record, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: {
        cacheControl: "no-store",
      },
    });
    console.log(`Indexed: gs://${bucketName}/${source.name} -> gs://${bucketName}/${targetPath}`);
  }

  console.log("Child profile by-center indexing complete.");
}

main().catch((error) => {
  console.error("Index migration failed.");
  console.error(error.message);
  process.exit(1);
});

