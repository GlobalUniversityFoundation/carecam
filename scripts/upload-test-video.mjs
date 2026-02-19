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
const DEFAULT_SOURCE_VIDEO = path.join(PROJECT_ROOT, "public", "video.mp4");
const DEFAULT_BUCKET = "storiesrus-d450d.appspot.com";
const DEFAULT_DESTINATION = "carecam/videos/video.mp4";

async function main() {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const sourceVideoPath = process.env.SOURCE_VIDEO_PATH || DEFAULT_SOURCE_VIDEO;
  const destinationPath =
    process.env.DESTINATION_PATH || DEFAULT_DESTINATION;

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account JSON not found: ${serviceAccountPath}`);
  }
  if (!fs.existsSync(sourceVideoPath)) {
    throw new Error(`Source video not found: ${sourceVideoPath}`);
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
  await bucket.upload(sourceVideoPath, {
    destination: destinationPath,
    metadata: {
      contentType: "video/mp4",
    },
  });

  console.log("Upload successful.");
  console.log(`Bucket: gs://${bucketName}`);
  console.log(`File: gs://${bucketName}/${destinationPath}`);
}

main().catch((error) => {
  console.error("Upload failed.");
  console.error(error.message);
  process.exit(1);
});

