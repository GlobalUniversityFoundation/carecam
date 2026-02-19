"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Manrope, Inter } from "next/font/google";
import Link from "next/link";
import ProfileMenu from "@/app/components/profile-menu";
import UploadVideoModalTrigger from "../upload-video-modal-trigger";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400"],
});

type SessionRow = {
  dateTime: string;
  duration: string;
  dominantCategory: string;
  status: string;
  details: string;
  uploadEpoch?: string;
};

type CategoryName =
  | "Aggression"
  | "Disruptive Behaviors"
  | "Motor Stereotypy"
  | "Vocal Stereotypy"
  | "Avoidance & Escape Behaviors";

type TrendPoint = {
  date: string;
  counts: Record<CategoryName, number>;
  total: number;
};

type ChildProfileClientProps = {
  icd: string;
};

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

export default function ChildProfileClient({ icd }: ChildProfileClientProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [childName, setChildName] = useState("");
  const [ageText, setAgeText] = useState("-");
  const [diagnosisText, setDiagnosisText] = useState("undiagnosed");
  const [sessionRows, setSessionRows] = useState<SessionRow[]>([]);
  const [trendRows, setTrendRows] = useState<TrendPoint[]>([]);
  const [isTrendLoading, setIsTrendLoading] = useState(true);

  const CATEGORY_ORDER: CategoryName[] = [
    "Aggression",
    "Disruptive Behaviors",
    "Motor Stereotypy",
    "Vocal Stereotypy",
    "Avoidance & Escape Behaviors",
  ];
  const CATEGORY_COLORS: Record<CategoryName, string> = {
    Aggression: "#2563EB",
    "Disruptive Behaviors": "#F97316",
    "Motor Stereotypy": "#9333EA",
    "Vocal Stereotypy": "#10B981",
    "Avoidance & Escape Behaviors": "#EF4444",
  };

  const refreshSessions = async () => {
    const sessionsRes = await fetch(`/api/children/sessions?icd=${encodeURIComponent(icd)}`, {
      cache: "no-store",
    });
    const sessionData = sessionsRes.ok
      ? ((await sessionsRes.json()) as { sessions?: SessionRow[] })
      : { sessions: [] };
    setSessionRows(sessionData.sessions || []);
  };

  useEffect(() => {
    let cancelled = false;
    const loadPageData = async () => {
      try {
        const [childRes, sessionsRes, trendRes] = await Promise.all([
          fetch(`/api/children?icd=${encodeURIComponent(icd)}`, { cache: "no-store" }),
          fetch(`/api/children/sessions?icd=${encodeURIComponent(icd)}`, { cache: "no-store" }),
          fetch(`/api/children/behavior-trend?icd=${encodeURIComponent(icd)}`, { cache: "no-store" }),
        ]);

        if (!childRes.ok) {
          throw new Error("Unable to load child profile.");
        }

        const childData = (await childRes.json()) as {
          child?: { childName?: string; dateOfBirth?: string; diagnosis?: string | null };
        };
        const sessionData = sessionsRes.ok
          ? ((await sessionsRes.json()) as { sessions?: SessionRow[] })
          : { sessions: [] };
        const trendData = trendRes.ok
          ? ((await trendRes.json()) as { trend?: TrendPoint[] })
          : { trend: [] };

        if (cancelled) {
          return;
        }

        const name = childData.child?.childName?.trim() || "";
        if (!name) {
          router.push("/home");
          return;
        }

        setChildName(name);
        setAgeText(calculateAge(childData.child?.dateOfBirth));
        setDiagnosisText(childData.child?.diagnosis?.trim() || "undiagnosed");
        setSessionRows(sessionData.sessions || []);
        setTrendRows(Array.isArray(trendData.trend) ? trendData.trend : []);
      } catch {
        if (!cancelled) {
          router.push("/home");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsTrendLoading(false);
        }
      }
    };
    void loadPageData();
    return () => {
      cancelled = true;
    };
  }, [icd, router]);

  const markerBottomPercent = 93.97076465099747;
  const careCamLeftPercent = 5.555555555555555;
  const topBoxCenterFromTopPercent = (100 - markerBottomPercent) / 2;
  const profileLeftPercent = 91.66666666666666;
  const profileTopPercent = 0.7108903856511317;
  const profileDiameterVh = 4.607454577700267;
  const backLeftPercent = 5.240972222222222;
  const backTopPercent = 9.480383430042214;
  const titleLeftPercent = 5.575694444444444;
  const titleTopPercent = 12.961968274103615;
  const uploadButtonTopPercent = 12.88443150619896;
  const uploadButtonLeftPercent = 81.04166666666667;
  const uploadButtonWidthPercent = 13.402777777777779;
  const uploadButtonHeightPercent = 4.8073932554316435;
  const subtitleTopPercent = 18.29319767183543;
  const sessionsTopPercent = 27.34149375749767;
  const tableTitleTopPercent = 33.09970231483539;
  const tableTitleLeftPercent = 5.659722222222222;
  const tableTitleRightPercent = 5.659722222222222;
  const tableTitleHeightPercent = 4.918469809392633;
  const tableBodyTopPercent = tableTitleTopPercent + tableTitleHeightPercent;
  const visibleEntryRows = 5;
  const entryRowHeightPx = 80;
  const dateTimeTitleLeftPercent = 6.999305555555556;
  const dateTimeTitleTopPercent = 34.09939130048429;
  const durationTitleLeftPercent = 27.92986111111111;
  const dominantCategoryTitleLeftPercent = 41.24236111111111;
  const statusTitleLeftPercent = 64.78402777777778;
  const detailsTitleLeftPercent = 85.06180555555557;
  const dateTimeColumnOffsetVw = dateTimeTitleLeftPercent - tableTitleLeftPercent;
  const durationColumnOffsetVw = durationTitleLeftPercent - tableTitleLeftPercent;
  const dominantColumnOffsetVw = dominantCategoryTitleLeftPercent - tableTitleLeftPercent;
  const statusColumnOffsetVw = statusTitleLeftPercent - tableTitleLeftPercent;
  const detailsColumnOffsetVw = detailsTitleLeftPercent - tableTitleLeftPercent;
  const sessionsToTableGapPx = ((tableTitleTopPercent - sessionsTopPercent) / 100) * 900.28;
  const trendHeadingTopCss = `calc(${tableBodyTopPercent}% + ${visibleEntryRows * entryRowHeightPx}px + ${sessionsToTableGapPx}px)`;
  const trendTableTitleTopCss = `calc(${trendHeadingTopCss} + ${sessionsToTableGapPx}px)`;
  const trendTableBodyTopCss = `calc(${trendTableTitleTopCss} + ${tableTitleHeightPercent}%)`;
  const trendTableBodyHeightPx = 320;
  const chartW = 1000;
  const chartH = 180;
  const chartPaddingLeft = 56;
  const chartPaddingRight = 20;
  const chartPaddingTop = 20;
  const chartPaddingBottom = 34;
  const plotW = chartW - chartPaddingLeft - chartPaddingRight;
  const plotH = chartH - chartPaddingTop - chartPaddingBottom;
  const safeTrend = trendRows.slice(-8);
  const maxY = Math.max(
    1,
    ...safeTrend.flatMap((point) => CATEGORY_ORDER.map((category) => point.counts?.[category] || 0)),
  );
  const xFor = (index: number) =>
    chartPaddingLeft +
    (safeTrend.length <= 1 ? 0 : (index / (safeTrend.length - 1)) * plotW);
  const yFor = (value: number) => chartPaddingTop + plotH - (value / maxY) * plotH;
  const trendLines = CATEGORY_ORDER.map((category) =>
    safeTrend
      .map((point, idx) => `${xFor(idx)},${yFor(point.counts?.[category] || 0)}`)
      .join(" "),
  );
  const pageBottomSpacerHeightCss = `calc(${trendTableBodyTopCss} + ${trendTableBodyHeightPx + 80}px)`;

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
      <Link
        href="/home"
        className={`${inter.className} absolute inline-flex items-center gap-[8px]`}
        style={{
          left: `${backLeftPercent}%`,
          top: `${backTopPercent}%`,
          color: "#0A52C7",
          fontWeight: 400,
          fontSize: "18.08px",
          lineHeight: "18.08px",
          letterSpacing: "0px",
          textDecoration: "none",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5" stroke="#0A52C7" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 19L5 12L12 5" stroke="#0A52C7" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Children profiles
      </Link>
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${titleLeftPercent}%`,
          top: `${titleTopPercent}%`,
          color: "#121417",
          fontWeight: 700,
          fontSize: "32px",
          lineHeight: "48.23px",
          letterSpacing: "0px",
        }}
      >
        {childName || "Loading..."}
        <span style={{ fontWeight: 400 }}> (All Sessions)</span>
      </p>
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${titleLeftPercent}%`,
          top: `${subtitleTopPercent}%`,
          color: "#637387",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "25.32px",
          letterSpacing: "0px",
        }}
      >
        {`Age ${ageText}, ${diagnosisText}`}
      </p>
      <UploadVideoModalTrigger
        topPercent={uploadButtonTopPercent}
        leftPercent={uploadButtonLeftPercent}
        widthPercent={uploadButtonWidthPercent}
        heightPercent={uploadButtonHeightPercent}
        icdCode={icd}
        onUploadComplete={() => {
          void refreshSessions();
        }}
      />
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${titleLeftPercent}%`,
          top: `${sessionsTopPercent}%`,
          color: "#121417",
          fontWeight: 700,
          fontSize: "28px",
          lineHeight: "33.76px",
          letterSpacing: "0px",
        }}
      >
        Sessions
      </p>
      <div
        className="absolute rounded-tl-[16px] rounded-tr-[16px] bg-[#F9FAFB]"
        style={{
          top: `${tableTitleTopPercent}%`,
          left: `${tableTitleLeftPercent}%`,
          width: `${100 - tableTitleLeftPercent - tableTitleRightPercent}%`,
          height: `${tableTitleHeightPercent}%`,
          border: "1.21px solid #E5E8EB",
        }}
      />
      <p className={`${manrope.className} absolute z-10 m-0`} style={{ left: `${dateTimeTitleLeftPercent}%`, top: `${dateTimeTitleTopPercent}%`, color: "#121417", fontWeight: 500, fontSize: "14px", lineHeight: "25.32px", letterSpacing: "0px" }}>Date &amp; Time</p>
      <p className={`${manrope.className} absolute z-10 m-0`} style={{ left: `${durationTitleLeftPercent}%`, top: `${dateTimeTitleTopPercent}%`, color: "#121417", fontWeight: 500, fontSize: "14px", lineHeight: "25.32px", letterSpacing: "0px" }}>Duration</p>
      <p className={`${manrope.className} absolute z-10 m-0`} style={{ left: `${dominantCategoryTitleLeftPercent}%`, top: `${dateTimeTitleTopPercent}%`, color: "#121417", fontWeight: 500, fontSize: "14px", lineHeight: "25.32px", letterSpacing: "0px" }}>Dominant category</p>
      <p className={`${manrope.className} absolute z-10 m-0`} style={{ left: `${statusTitleLeftPercent}%`, top: `${dateTimeTitleTopPercent}%`, color: "#121417", fontWeight: 500, fontSize: "14px", lineHeight: "25.32px", letterSpacing: "0px" }}>Status</p>
      <p className={`${manrope.className} absolute z-10 m-0`} style={{ left: `${detailsTitleLeftPercent}%`, top: `${dateTimeTitleTopPercent}%`, color: "#121417", fontWeight: 500, fontSize: "14px", lineHeight: "25.32px", letterSpacing: "0px" }}>Details</p>

      <div
        className="entries-scroll absolute"
        style={{
          top: `${tableBodyTopPercent}%`,
          left: `${tableTitleLeftPercent}%`,
          width: `${100 - tableTitleLeftPercent - tableTitleRightPercent}%`,
          height: `${visibleEntryRows * entryRowHeightPx}px`,
          overflowY: "overlay",
          overflowX: "hidden",
          borderLeft: "1.21px solid #E5E8EB",
          borderRight: "1.21px solid #E5E8EB",
          borderBottom: "1.21px solid #E5E8EB",
          borderBottomLeftRadius: "16px",
          borderBottomRightRadius: "16px",
        }}
      >
        {isLoading ? (
          <div
            className={`${manrope.className} flex h-full items-center justify-center text-center`}
            style={{ color: "#121712", fontWeight: 400, fontSize: "14px", lineHeight: "25.32px", letterSpacing: "0px" }}
          >
            Loading...
          </div>
        ) : sessionRows.length === 0 ? (
          <div
            className={`${manrope.className} flex h-full items-center justify-center text-center`}
            style={{ color: "#121712", fontWeight: 400, fontSize: "14px", lineHeight: "25.32px", letterSpacing: "0px" }}
          >
            No videos yet, add one to continue
          </div>
        ) : (
          sessionRows.map((row, index) => (
            <div
              key={`${row.dateTime}-${index}`}
              className={`${manrope.className} relative`}
              style={{
                height: `${entryRowHeightPx}px`,
                backgroundColor: "#FFFFFF",
                borderBottom: "1.21px solid #E5E8EB",
                color: "#121712",
                fontWeight: 400,
                fontSize: "14px",
                lineHeight: "25.32px",
                letterSpacing: "0px",
              }}
            >
              <span className="absolute -translate-y-1/2" style={{ top: "50%", left: `${dateTimeColumnOffsetVw}vw` }}>{row.dateTime}</span>
              <span className="absolute -translate-y-1/2" style={{ top: "50%", left: `${durationColumnOffsetVw}vw`, color: "#637387" }}>{row.duration}</span>
              <span className="absolute -translate-y-1/2" style={{ top: "50%", left: `${dominantColumnOffsetVw}vw`, color: "#637387" }}>{row.dominantCategory}</span>
              <span className="absolute -translate-y-1/2" style={{ top: "50%", left: `${statusColumnOffsetVw}vw`, fontWeight: 700, color: row.status === "Reviewed" ? "#15803D" : "#8E98A8" }}>{row.status}</span>
              {row.uploadEpoch ? (
                <Link
                  href={`/child-profile/${encodeURIComponent(icd)}/${encodeURIComponent(row.uploadEpoch)}`}
                  className="absolute -translate-y-1/2"
                  style={{
                    top: "50%",
                    left: `${detailsColumnOffsetVw}vw`,
                    color: "#0A52C7",
                    fontWeight: 700,
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  {row.details}
                </Link>
              ) : (
                <span
                  className="absolute -translate-y-1/2"
                  style={{ top: "50%", left: `${detailsColumnOffsetVw}vw`, color: "#0A52C7", fontWeight: 700 }}
                >
                  {row.details}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${titleLeftPercent}%`,
          top: trendHeadingTopCss,
          color: "#121417",
          fontWeight: 700,
          fontSize: "28px",
          lineHeight: "33.76px",
          letterSpacing: "0px",
        }}
      >
        Behavior trend over time
      </p>
      <div
        className="absolute rounded-tl-[16px] rounded-tr-[16px] bg-[#F9FAFB]"
        style={{
          top: trendTableTitleTopCss,
          left: `${tableTitleLeftPercent}%`,
          width: `${100 - tableTitleLeftPercent - tableTitleRightPercent}%`,
          height: `${tableTitleHeightPercent}%`,
          border: "1.21px solid #E5E8EB",
        }}
      />
      <div
        className="absolute rounded-bl-[16px] rounded-br-[16px] bg-white"
        style={{
          top: trendTableBodyTopCss,
          left: `${tableTitleLeftPercent}%`,
          width: `${100 - tableTitleLeftPercent - tableTitleRightPercent}%`,
          height: `${trendTableBodyHeightPx}px`,
          borderLeft: "1.21px solid #E5E8EB",
          borderRight: "1.21px solid #E5E8EB",
          borderBottom: "1.21px solid #E5E8EB",
          padding: "20px 24px",
        }}
      >
        {isTrendLoading ? (
          <div
            className={`${manrope.className} flex h-full items-center justify-center`}
            style={{ color: "#121712", fontSize: "14px", lineHeight: "25.32px" }}
          >
            Loading...
          </div>
        ) : safeTrend.length === 0 ? (
          <div
            className={`${manrope.className} flex h-full items-center justify-center`}
            style={{ color: "#121712", fontSize: "14px", lineHeight: "25.32px" }}
          >
            No trend data available yet.
          </div>
        ) : (
          <div className="h-full w-full">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="h-[220px] w-full" preserveAspectRatio="none">
              <line
                x1={chartPaddingLeft}
                y1={chartPaddingTop + plotH}
                x2={chartPaddingLeft + plotW}
                y2={chartPaddingTop + plotH}
                stroke="#CBD5E1"
                strokeWidth="1"
              />
              <line
                x1={chartPaddingLeft}
                y1={chartPaddingTop}
                x2={chartPaddingLeft}
                y2={chartPaddingTop + plotH}
                stroke="#CBD5E1"
                strokeWidth="1"
              />
              {CATEGORY_ORDER.map((category, idx) => (
                <g key={category}>
                  <polyline
                    points={trendLines[idx]}
                    fill="none"
                    stroke={CATEGORY_COLORS[category]}
                    strokeWidth="2"
                  />
                  {safeTrend.map((point, pointIdx) => (
                    <circle
                      key={`${category}-${point.date}-${pointIdx}`}
                      cx={xFor(pointIdx)}
                      cy={yFor(point.counts?.[category] || 0)}
                      r="2.5"
                      fill={CATEGORY_COLORS[category]}
                    />
                  ))}
                </g>
              ))}
              {safeTrend.map((point, idx) => (
                <text
                  key={`label-${point.date}-${idx}`}
                  x={xFor(idx)}
                  y={chartPaddingTop + plotH + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#64748B"
                >
                  {point.date}
                </text>
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {CATEGORY_ORDER.map((category) => (
                <span
                  key={`legend-${category}`}
                  className={`${manrope.className} inline-flex items-center gap-2`}
                  style={{ fontSize: "12px", lineHeight: "16px", color: CATEGORY_COLORS[category] }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "999px",
                      backgroundColor: CATEGORY_COLORS[category],
                    }}
                  />
                  {category}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div aria-hidden style={{ height: pageBottomSpacerHeightCss }} />
    </main>
  );
}

