import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Manrope } from "next/font/google";
import Link from "next/link";
import { verifyAuthToken } from "@/lib/jwt";
import ChildrenTable from "./children-table";
import ProfileMenu from "@/app/components/profile-menu";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("carecam_token")?.value;
  if (!token) {
    redirect("/");
  }

  try {
    verifyAuthToken(token);
  } catch {
    redirect("/");
  }

  const markerBottomPercent = 93.97076465099747;
  const careCamLeftPercent = 5.555555555555555;
  const topBoxCenterFromTopPercent = (100 - markerBottomPercent) / 2;
  const referenceBoxTopPercent = 10.441196072333052;
  const referenceBoxLeftPercent = 5.555555555555555;
  const referenceBoxWidthPercent = 88.88888888888889;
  const referenceBoxHeightPercent = 8.13968987426134;
  const secondReferenceBoxTopPercent = 18.660861065446306;
  const secondReferenceBoxLeftPercent = 5.625;
  const secondReferenceBoxWidthPercent = 88.75;
  const secondReferenceBoxHeightPercent = 4.918469809392633;
  const searchBoxTopPercent = 11.77411471986493;
  const searchBoxLeftPercent = 61.80555555555556;
  const searchBoxWidthPercent = 18.40277777777778;
  const searchBoxHeightPercent = 4.8073932554316435;
  const addChildTopPercent = 11.77411471986493;
  const addChildLeftPercent = 81.04166666666667;
  const addChildWidthPercent = 13.402777777777779;
  const addChildHeightPercent = 4.8073932554316435;
  const profileLeftPercent = 91.66666666666666;
  const profileTopPercent = 0.7108903856511317;
  const profileDiameterVh = 4.607454577700267;
  const rowTextLeftOffset = "1.6666666666666667vw";
  const tableBodyTopPercent = secondReferenceBoxTopPercent + secondReferenceBoxHeightPercent;
  const visibleEntryRows = 5;
  const entryRowHeightPx = 80;
  const titleOffsetPercent = 1.6666666666666667;
  const tableHeaderCenterTopPercent =
    secondReferenceBoxTopPercent + secondReferenceBoxHeightPercent / 2;
  const columnTitleStarts = [
    { title: "Client Name", borderLeftPercent: secondReferenceBoxLeftPercent },
    { title: "Age", borderLeftPercent: 20.625 },
    { title: "Diagnosis", borderLeftPercent: 26.52777777777778 },
    { title: "Assigned Therapist", borderLeftPercent: 56.73611111111111 },
    { title: "Status", borderLeftPercent: 71.73611111111111 },
    { title: "Details", borderLeftPercent: 86.94444444444444 },
  ];
  return (
    <main className="relative h-screen w-screen bg-white">
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
      <div
        className="absolute flex items-center"
        style={{
          top: `${referenceBoxTopPercent}%`,
          left: `${referenceBoxLeftPercent}%`,
          width: `${referenceBoxWidthPercent}%`,
          height: `${referenceBoxHeightPercent}%`,
        }}
      >
        <p
          className={`${manrope.className} m-0`}
          style={{
            color: "#121712",
            fontWeight: 700,
            fontSize: "32px",
            lineHeight: "48.23px",
            letterSpacing: "0px",
          }}
        >
          Children
        </p>
      </div>
      <div
        className="absolute rounded-tl-[16px] rounded-tr-[16px] bg-[#F9FAFB]"
        style={{
          top: `${secondReferenceBoxTopPercent}%`,
          left: `${secondReferenceBoxLeftPercent}%`,
          width: `${secondReferenceBoxWidthPercent}%`,
          height: `${secondReferenceBoxHeightPercent}%`,
          border: "1.21px solid #E5E8EB",
        }}
      />
      {columnTitleStarts.map(({ title, borderLeftPercent }) => (
        <p
          key={title}
          className={`${manrope.className} absolute z-10 m-0`}
          style={{
            top: `${tableHeaderCenterTopPercent}%`,
            left: `${borderLeftPercent + titleOffsetPercent}%`,
            transform: "translateY(-50%)",
            color: "#121712",
            fontWeight: 500,
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
          }}
        >
          {title}
        </p>
      ))}
      <ChildrenTable
        searchBoxTopPercent={searchBoxTopPercent}
        searchBoxLeftPercent={searchBoxLeftPercent}
        searchBoxWidthPercent={searchBoxWidthPercent}
        searchBoxHeightPercent={searchBoxHeightPercent}
        tableBodyTopPercent={tableBodyTopPercent}
        secondReferenceBoxLeftPercent={secondReferenceBoxLeftPercent}
        secondReferenceBoxWidthPercent={secondReferenceBoxWidthPercent}
        visibleEntryRows={visibleEntryRows}
        entryRowHeightPx={entryRowHeightPx}
        rowTextLeftOffset={rowTextLeftOffset}
      />
      <Link
        href="/add-child"
        className={`${manrope.className} absolute rounded-[8px] bg-[#0A52C7] text-white`}
        style={{
          top: `${addChildTopPercent}%`,
          left: `${addChildLeftPercent}%`,
          width: `${addChildWidthPercent}%`,
          height: `${addChildHeightPercent}%`,
          fontWeight: 700,
          fontSize: "14.36px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Add Child
      </Link>
    </main>
  );
}

