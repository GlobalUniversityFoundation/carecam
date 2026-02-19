import { Manrope } from "next/font/google";
import ProfileMenu from "@/app/components/profile-menu";
import SessionReviewClient from "./session-review-client";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default async function ChildProfileSessionPage({
  params,
}: {
  params: Promise<{ icd: string; uploadEpoch: string }>;
}) {
  const resolved = await params;
  const icd = decodeURIComponent(resolved.icd || "");
  const uploadEpoch = decodeURIComponent(resolved.uploadEpoch || "");

  const markerBottomPercent = 93.97076465099747;
  const careCamLeftPercent = 5.555555555555555;
  const topBoxCenterFromTopPercent = (100 - markerBottomPercent) / 2;
  const profileLeftPercent = 91.66666666666666;
  const profileTopPercent = 0.7108903856511317;
  const profileDiameterVh = 4.607454577700267;
  return (
    <main className="relative min-h-screen bg-white">
      <ProfileMenu
        leftPercent={profileLeftPercent}
        topPercent={profileTopPercent}
        diameterVh={profileDiameterVh}
        logoutPath="/api/auth/logout"
        logoutRedirect="/"
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
      <SessionReviewClient
        icd={icd}
        uploadEpoch={uploadEpoch}
        manropeClassName={manrope.className}
      />
    </main>
  );
}

