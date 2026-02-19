import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
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
const USERS_PREFIX = "carecam/users";
const THERAPISTS_PREFIX = "carecam/therapists";
const CHILD_PROFILES_PREFIX = "carecam/child_profiles";

type TherapistRecord = {
  id: string;
  name: string;
  center: string;
};

type ChildProfileRecord = {
  childName?: string;
  icdCode?: string;
  center?: string;
};

type DashboardChild = {
  childName: string;
  icdKey: string;
};

type DashboardRow = {
  email: string;
  therapists: string;
  children: DashboardChild[];
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

async function getAdminDashboardRows() {
  const bucket = getBucket();
  const [userFiles] = await bucket.getFiles({ prefix: `${USERS_PREFIX}/` });
  const [therapistFiles] = await bucket.getFiles({ prefix: `${THERAPISTS_PREFIX}/` });
  const [childFiles] = await bucket.getFiles({ prefix: `${CHILD_PROFILES_PREFIX}/` });

  const userEmails = (
    await Promise.all(
      userFiles
        .filter((file) => !file.name.endsWith("/"))
        .map(async (file) => {
          const [content] = await file.download();
          const parsed = JSON.parse(content.toString("utf8")) as { email?: string };
          return parsed.email?.trim().toLowerCase() || null;
        }),
    )
  ).filter((email): email is string => Boolean(email));

  const therapists = (
    await Promise.all(
      therapistFiles
        .filter((file) => !file.name.endsWith("/"))
        .map(async (file) => {
          const [content] = await file.download();
          return JSON.parse(content.toString("utf8")) as TherapistRecord;
        }),
    )
  ).filter((therapist) => therapist.center && therapist.name);

  const therapistsByCenter = new Map<string, string[]>();
  therapists.forEach((therapist) => {
    const centerEmail = therapist.center.trim().toLowerCase();
    if (!therapistsByCenter.has(centerEmail)) {
      therapistsByCenter.set(centerEmail, []);
    }
    therapistsByCenter.get(centerEmail)?.push(therapist.name);
  });

  const childProfiles = (
    await Promise.all(
      childFiles
        .filter((file) => !file.name.endsWith("/"))
        .map(async (file) => {
          const [content] = await file.download();
          const parsed = JSON.parse(content.toString("utf8")) as ChildProfileRecord;
          const fileName = file.name.split("/").pop() || "";
          const icdKey = fileName.endsWith(".json") ? fileName.slice(0, -5) : fileName;
          return {
            ...parsed,
            __icdKey: icdKey,
          };
        }),
    )
  ).filter((child) => child.center && child.__icdKey);

  const childrenByCenter = new Map<string, DashboardChild[]>();
  childProfiles.forEach((child) => {
    const centerEmail = child.center?.trim().toLowerCase();
    if (!centerEmail) {
      return;
    }
    if (!childrenByCenter.has(centerEmail)) {
      childrenByCenter.set(centerEmail, []);
    }
    const childName = child.childName?.trim() || child.icdCode?.trim() || child.__icdKey;
    if (!childName) return;
    childrenByCenter.get(centerEmail)?.push({
      childName,
      icdKey: child.__icdKey,
    });
  });

  const rows: DashboardRow[] = userEmails
    .sort((a, b) => a.localeCompare(b))
    .map((email) => {
      const mappedTherapists = therapistsByCenter.get(email) || [];
      const mappedChildren = childrenByCenter.get(email) || [];
      return {
        email,
        therapists: mappedTherapists.length ? mappedTherapists.join(", ") : "-",
        children: mappedChildren
          .sort((a, b) => a.childName.localeCompare(b.childName)),
      };
    });

  return rows;
}

export default async function AdminDashboardPage() {
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

  const rows = await getAdminDashboardRows();
  const markerBottomPercent = 93.97076465099747;
  const careCamLeftPercent = 5.555555555555555;
  const topBoxCenterFromTopPercent = (100 - markerBottomPercent) / 2;
  const profileLeftPercent = 91.66666666666666;
  const profileTopPercent = 0.7108903856511317;
  const profileDiameterVh = 4.607454577700267;

  return (
    <main className="relative min-h-screen bg-white pb-10">
      <ProfileMenu
        leftPercent={profileLeftPercent}
        topPercent={profileTopPercent}
        diameterVh={profileDiameterVh}
        logoutPath="/api/admin/logout"
        logoutRedirect="/admin"
      />
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          top: `${topBoxCenterFromTopPercent}%`,
          left: `${careCamLeftPercent}%`,
          transform: "translateY(-50%)",
          color: "#121417",
          fontWeight: 700,
          fontSize: "21.7px",
          lineHeight: "27.73px",
          letterSpacing: "0px",
        }}
      >
        CareCam
      </p>
      <div
        className="absolute left-0 w-full"
        style={{
          bottom: `${markerBottomPercent}%`,
          borderTop: "1.21px solid #E5E8EB",
        }}
      />

      <section className="mx-[5.555555%] pt-[120px]">
        <div className="mb-4 flex items-center justify-between">
          <h1 className={`${manrope.className} text-[32px] font-bold text-[#121712]`}>
            Admin Dashboard
          </h1>
          <Link
            href="/admin/add-therapist"
            className={`${manrope.className} rounded-md bg-[#0A52C7] px-4 py-2 text-sm font-semibold text-white`}
          >
            Add Therapist
          </Link>
        </div>
        <div className="overflow-x-auto rounded-[16px] border border-[#E5E8EB] bg-white">
          <table className={`${manrope.className} w-full border-collapse`}>
            <thead className="bg-[#F9FAFB]">
              <tr>
                <th className="border-b border-[#E5E8EB] px-6 py-4 text-left text-[14px] font-medium text-[#121712]">
                  User (Center Email)
                </th>
                <th className="border-b border-[#E5E8EB] px-6 py-4 text-left text-[14px] font-medium text-[#121712]">
                  Assigned Therapists
                </th>
                <th className="border-b border-[#E5E8EB] px-6 py-4 text-left text-[14px] font-medium text-[#121712]">
                  Assigned Children
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 py-6 text-[14px] font-normal text-[#121712]"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.email}>
                    <td className="border-b border-[#E5E8EB] px-6 py-4 text-[14px] font-normal text-[#121712]">
                      {row.email}
                    </td>
                    <td className="border-b border-[#E5E8EB] px-6 py-4 text-[14px] font-normal text-[#121712]">
                      {row.therapists}
                    </td>
                    <td className="border-b border-[#E5E8EB] px-6 py-4 text-[14px] font-normal text-[#121712]">
                      {row.children.length === 0 ? (
                        "-"
                      ) : (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {row.children.map((child) => (
                            <Link
                              key={`${row.email}-${child.icdKey}`}
                              href={`/admin/children/${encodeURIComponent(child.icdKey)}`}
                              className="text-[#0A52C7] underline underline-offset-2"
                            >
                              {child.childName}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

