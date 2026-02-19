import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Manrope } from "next/font/google";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { verifyAuthToken } from "@/lib/jwt";
import ProfileMenu from "@/app/components/profile-menu";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const DEFAULT_BUCKET = "storiesrus-d450d.appspot.com";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "secrets",
  "storiesrus-d450d-firebase-adminsdk-iuwd4-fdc0e0c4cd.json",
);
const CHILD_PROFILES_PREFIX = "carecam/child_profiles";
const CHILD_VIDEO_SESSIONS_PREFIX = "carecam/child_video_sessions";

type ChildProfileRecord = {
  childName?: string;
  icdCode?: string;
};

type SessionRecord = {
  uploadedAt?: string;
  status?: string;
  processedVideoPath?: string;
  analysisJsonPath?: string;
};

type SessionArtifactRow = {
  id: string;
  label: string;
  uploadedAt: string;
  status: string;
  videoPath: string;
  jsonPath: string;
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

function formatDateTime(isoDateTime: string | undefined) {
  if (!isoDateTime) return "-";
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

async function getPageData(icdKey: string) {
  const bucket = getBucket();
  const childFile = bucket.file(`${CHILD_PROFILES_PREFIX}/${icdKey}.json`);
  const [exists] = await childFile.exists();
  if (!exists) {
    return { childName: icdKey, icdCode: icdKey, rows: [] as SessionArtifactRow[] };
  }

  const [childContent] = await childFile.download();
  const child = JSON.parse(childContent.toString("utf8")) as ChildProfileRecord;
  const childName = child.childName?.trim() || icdKey;
  const icdCode = child.icdCode?.trim() || icdKey;

  const [sessionFiles] = await bucket.getFiles({
    prefix: `${CHILD_VIDEO_SESSIONS_PREFIX}/${icdKey}/`,
  });

  const sessions = await Promise.all(
    sessionFiles
      .filter((file) => !file.name.endsWith("/"))
      .map(async (file) => {
        const [content] = await file.download();
        return JSON.parse(content.toString("utf8")) as SessionRecord;
      }),
  );

  const rows = sessions
    .filter((session) => session.processedVideoPath && session.analysisJsonPath)
    .sort((a, b) => {
      const aTs = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const bTs = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      return bTs - aTs;
    })
    .map((session, index) => ({
      id: `${session.uploadedAt || "na"}-${index}`,
      label: `Session ${index + 1}`,
      uploadedAt: formatDateTime(session.uploadedAt),
      status: session.status?.trim() || "-",
      videoPath: session.processedVideoPath || "",
      jsonPath: session.analysisJsonPath || "",
    }));

  return { childName, icdCode, rows };
}

export default async function AdminChildArtifactsPage({
  params,
}: {
  params: Promise<{ icd: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("carecam_admin_token")?.value;
  if (!token) {
    redirect("/admin");
  }

  try {
    const payload = verifyAuthToken(token);
    if (payload.role !== "admin" || payload.email !== "admin@carecam.co") {
      redirect("/admin");
    }
  } catch {
    redirect("/admin");
  }

  const resolvedParams = await params;
  const icdKey = decodeURIComponent(resolvedParams.icd || "").trim().toLowerCase();
  if (!icdKey) {
    redirect("/admin/dashboard");
  }

  const { childName, icdCode, rows } = await getPageData(icdKey);

  return (
    <main className="relative min-h-screen bg-white pb-12">
      <ProfileMenu
        leftPercent={91.66666666666666}
        topPercent={0.7108903856511317}
        diameterVh={4.607454577700267}
        logoutPath="/api/admin/logout"
        logoutRedirect="/admin"
      />
      <section className="mx-[5.555555%] pt-[120px]">
        <Link href="/admin/dashboard" className={`${manrope.className} text-[14px] font-semibold text-[#0A52C7]`}>
          ← Back to Dashboard
        </Link>
        <h1 className={`${manrope.className} mt-4 text-[32px] font-bold text-[#121712]`}>
          {childName}
        </h1>
        <p className={`${manrope.className} mt-1 text-[14px] font-normal text-[#637387]`}>
          ICD: {icdCode}
        </p>

        <div className="mt-6 rounded-[16px] border border-[#E5E8EB] bg-white">
          <div className="border-b border-[#E5E8EB] bg-[#F9FAFB] px-6 py-4">
            <p className={`${manrope.className} text-[16px] font-semibold text-[#121712]`}>
              Processed Outputs
            </p>
          </div>
          <div className="px-6 py-4">
            {rows.length === 0 ? (
              <p className={`${manrope.className} text-[14px] font-normal text-[#121712]`}>
                No processed videos found for this child yet.
              </p>
            ) : (
              <div className="space-y-5">
                {rows.map((row) => (
                  <div key={row.id} className="rounded-[10px] border border-[#E5E8EB] p-4">
                    <p className={`${manrope.className} text-[15px] font-semibold text-[#121712]`}>
                      {row.label}
                    </p>
                    <p className={`${manrope.className} mt-1 text-[13px] font-normal text-[#637387]`}>
                      Uploaded: {row.uploadedAt} · Status: {row.status}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-6">
                      <Link
                        href={`/api/admin/child-artifact?path=${encodeURIComponent(row.videoPath)}`}
                        target="_blank"
                        className={`${manrope.className} text-[14px] font-semibold text-[#0A52C7] underline underline-offset-2`}
                      >
                        Video {row.label.split(" ").pop()}
                      </Link>
                      <Link
                        href={`/api/admin/child-artifact?path=${encodeURIComponent(row.jsonPath)}`}
                        target="_blank"
                        className={`${manrope.className} text-[14px] font-semibold text-[#0A52C7] underline underline-offset-2`}
                      >
                        Json {row.label.split(" ").pop()}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

