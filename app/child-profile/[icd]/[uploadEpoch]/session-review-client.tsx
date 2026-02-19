"use client";

import Link from "next/link";
import { Inter } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import SessionVideoPlayer from "./session-video-player";
import { exportSessionReportPdf } from "./export-session-report";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400"],
});

type SessionReviewClientProps = {
  icd: string;
  uploadEpoch: string;
  manropeClassName: string;
};

type ChildResponse = {
  child?: {
    childName?: string;
    dateOfBirth?: string;
    diagnosis?: string | null;
    assignedTherapistName?: string | null;
  };
};

type SessionRow = {
  dateTime: string;
  duration: string;
  durationSeconds?: number | null;
  dominantCategory?: string;
  detectedBehaviorCount?: number | null;
  uploadEpoch?: string;
  uploadedAt?: string;
};

type SessionsResponse = {
  sessions?: SessionRow[];
};

function calculateAge(dateOfBirth: string | undefined) {
  if (!dateOfBirth) return "-";
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "-";
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

function formatUploadDate(uploadEpoch: string) {
  const parsed = Number(uploadEpoch);
  if (!Number.isFinite(parsed) || parsed <= 0) return "-";
  const date = new Date(parsed);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateFromIso(isoDateTime: string | undefined) {
  if (!isoDateTime) return "-";
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDurationHms(durationSeconds: number | null | undefined) {
  if (durationSeconds === null || durationSeconds === undefined || !Number.isFinite(durationSeconds)) {
    return "-";
  }
  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function SessionReviewClient({
  icd,
  uploadEpoch,
  manropeClassName,
}: SessionReviewClientProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [childName, setChildName] = useState(icd);
  const [ageText, setAgeText] = useState("-");
  const [diagnosisText, setDiagnosisText] = useState("undiagnosed");
  const [therapistName, setTherapistName] = useState("-");
  const [durationText, setDurationText] = useState("-");
  const [uploadDateText, setUploadDateText] = useState(formatUploadDate(uploadEpoch));
  const [detectedCount, setDetectedCount] = useState(0);
  const [dominantCategory, setDominantCategory] = useState("-");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [childRes, sessionsRes] = await Promise.all([
          fetch(`/api/children?icd=${encodeURIComponent(icd)}`, { cache: "no-store" }),
          fetch(`/api/children/sessions?icd=${encodeURIComponent(icd)}`, { cache: "no-store" }),
        ]);

        const childData: ChildResponse = childRes.ok ? await childRes.json() : {};
        const sessionsData: SessionsResponse = sessionsRes.ok ? await sessionsRes.json() : {};

        if (cancelled) return;

        const child = childData.child;
        setChildName(child?.childName?.trim() || icd);
        setAgeText(calculateAge(child?.dateOfBirth));
        setDiagnosisText(child?.diagnosis?.trim() || "undiagnosed");
        setTherapistName(child?.assignedTherapistName?.trim() || "-");

        const matchingSession = (sessionsData.sessions || []).find(
          (session) => (session.uploadEpoch || "").trim() === uploadEpoch,
        );
        setDurationText(
          matchingSession?.durationSeconds !== undefined
            ? formatDurationHms(matchingSession.durationSeconds)
            : (matchingSession?.duration || "-"),
        );
        setUploadDateText(
          matchingSession?.uploadedAt
            ? formatDateFromIso(matchingSession.uploadedAt)
            : formatUploadDate(uploadEpoch),
        );
        setDetectedCount(
          matchingSession?.detectedBehaviorCount !== undefined &&
            matchingSession?.detectedBehaviorCount !== null
            ? Number(matchingSession.detectedBehaviorCount)
            : 0,
        );
        setDominantCategory(
          matchingSession?.dominantCategory?.trim() || "-",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [icd, uploadEpoch]);

  useEffect(() => {
    void fetch("/api/children/session-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        icd,
        uploadEpoch,
      }),
    }).catch(() => {
      // No-op. Session review page should stay usable even if this update fails.
    });
  }, [icd, uploadEpoch]);

  const positions = useMemo(
    () => ({
      backLeftPercent: 5.310416666666667,
      backTopPercent: 9.663660863732837,
      titleLeftPercent: 5.645138888888889,
      titleTopPercent: 13.14613099435641,
      exportButtonLeftPercent: 81.04166666666667,
      subtitleLeftPercent: 5.645138888888889,
      subtitleTopPercent: 18.588649753188333,
      dateLeftPercent: 21.964583333333334,
      dateTopPercent: 18.910549606723032,
      durationLeftPercent: 31.478472222222223,
      therapistLeftPercent: 41.200694444444444,
      videoLeftPercent: 5.555555555555555,
      videoRightPercent: 28.125,
      videoTopPercent: 27.14123139098858,
      sessionSummaryLeftPercent: 73.47222222222223,
      sessionSummaryTopPercent: 27.14123139098858,
      summaryBodyTopPercent: 33.32768382547252,
    }),
    [],
  );
  const videoWidthPercent = 100 - positions.videoLeftPercent - positions.videoRightPercent;
  const controlsTopCss = `calc(${positions.videoTopPercent}% + ${(videoWidthPercent * 9) / 16}vw + 10px)`;
  const pageBottomSpacerHeightCss = `calc(${controlsTopCss} + 40px + 40px + 308px + 980px)`;

  return (
    <>
      <Link
        href={`/child-profile/${encodeURIComponent(icd)}`}
        className={`${inter.className} absolute inline-flex items-center gap-[8px]`}
        style={{
          left: `${positions.backLeftPercent}%`,
          top: `${positions.backTopPercent}%`,
          color: "#666666",
          fontWeight: 400,
          fontSize: "18.08px",
          lineHeight: "18.08px",
          letterSpacing: "0px",
          textDecoration: "none",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5" stroke="#666666" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 19L5 12L12 5" stroke="#666666" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Child profile
      </Link>

      {isLoading ? (
        <div
          className={`${manropeClassName} absolute left-0 top-0 flex h-screen w-screen items-center justify-center`}
          style={{ color: "#121417", fontWeight: 500, fontSize: "18px" }}
        >
          Loading...
        </div>
      ) : null}

      <p
        className={`${manropeClassName} absolute m-0`}
        style={{
          left: `${positions.titleLeftPercent}%`,
          top: `${positions.titleTopPercent}%`,
          color: "#121417",
          fontWeight: 700,
          fontSize: "28px",
          lineHeight: "48.23px",
          letterSpacing: "0px",
        }}
      >
        {childName}
        <span style={{ fontWeight: 500 }}> (Session Review)</span>
      </p>

      <button
        type="button"
        className={`${manropeClassName} absolute`}
        onClick={() => {
          if (isExporting) return;
          setIsExporting(true);
          void exportSessionReportPdf(icd, uploadEpoch)
            .catch(() => {
              window.alert("Failed to export report.");
            })
            .finally(() => {
              setIsExporting(false);
            });
        }}
        disabled={isExporting}
        style={{
          left: `${positions.exportButtonLeftPercent}%`,
          top: `${positions.titleTopPercent}%`,
          width: "193px",
          height: "44px",
          border: "none",
          borderRadius: "7.18px",
          backgroundColor: "#0A52C7",
          color: "#FFFFFF",
          fontWeight: 700,
          fontStyle: "normal",
          fontSize: "14.36px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          textAlign: "center",
          cursor: isExporting ? "not-allowed" : "pointer",
          opacity: isExporting ? 0.75 : 1,
        }}
      >
        {isExporting ? "Exporting..." : "Export Report"}
      </button>

      <p
        className={`${manropeClassName} absolute m-0`}
        style={{
          left: `${positions.subtitleLeftPercent}%`,
          top: `${positions.subtitleTopPercent}%`,
          color: "#344054",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          Age:
        </span>{" "}
        <span
          style={{
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          {`${ageText}, ${diagnosisText}`}
        </span>
      </p>

      <p
        className={`${manropeClassName} absolute m-0`}
        style={{
          left: `${positions.dateLeftPercent}%`,
          top: `${positions.dateTopPercent}%`,
          color: "#344054",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          Date:
        </span>{" "}
        <span
          style={{
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          {uploadDateText}
        </span>
      </p>

      <p
        className={`${manropeClassName} absolute m-0`}
        style={{
          left: `${positions.durationLeftPercent}%`,
          top: `${positions.dateTopPercent}%`,
          color: "#344054",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          Duration:
        </span>{" "}
        <span
          style={{
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          {durationText}
        </span>
      </p>

      <p
        className={`${manropeClassName} absolute m-0`}
        style={{
          left: `${positions.therapistLeftPercent}%`,
          top: `${positions.dateTopPercent}%`,
          color: "#344054",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          Therapist:
        </span>{" "}
        <span
          style={{
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          {therapistName}
        </span>
      </p>

      <SessionVideoPlayer
        icd={icd}
        uploadEpoch={uploadEpoch}
        topPercent={positions.videoTopPercent}
        leftPercent={positions.videoLeftPercent}
        rightPercent={positions.videoRightPercent}
        manropeClassName={manropeClassName}
      />
      <p
        className={`${manropeClassName} absolute m-0`}
        style={{
          left: `${positions.sessionSummaryLeftPercent}%`,
          top: `${positions.sessionSummaryTopPercent}%`,
          color: "#121417",
          fontWeight: 700,
          fontStyle: "normal",
          fontSize: "28px",
          lineHeight: "33.76px",
          letterSpacing: "0px",
        }}
      >
        Session Summary
      </p>
      <p
        className={`${manropeClassName} absolute m-0 whitespace-pre-line`}
        style={{
          left: `${positions.sessionSummaryLeftPercent}%`,
          top: `${positions.summaryBodyTopPercent}%`,
          color: "#434343",
          fontWeight: 400,
          fontStyle: "normal",
          fontSize: "18px",
          lineHeight: "25.32px",
          letterSpacing: "0px",
        }}
      >
        {`Detected ${detectedCount} behavioural instances\nacross video chunks.\n\n\nDominant category:\n`}
        <span
          style={{
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: "18px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
          }}
        >
          {dominantCategory}
        </span>
      </p>
      <div aria-hidden style={{ height: pageBottomSpacerHeightCss }} />
    </>
  );
}

