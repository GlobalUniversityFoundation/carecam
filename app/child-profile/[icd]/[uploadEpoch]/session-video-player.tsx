"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type SessionVideoPlayerProps = {
  icd: string;
  uploadEpoch: string;
  topPercent: number;
  leftPercent: number;
  rightPercent: number;
  manropeClassName: string;
};

type AnalysisBehavior = {
  behavior?: string;
  modality?: string;
  startSec?: number;
  endSec?: number;
  notes?: string;
};

type BehaviorRow = {
  id: string;
  behavior: string;
  category: string;
  startSec: number;
  endSec: number;
  details: string;
  source: "detected" | "manual";
};

const ALL_BEHAVIOR_OPTIONS = [
  "hitting the therapist with hand",
  "kicking the therapist with foot",
  "throwing objects",
  "non compliance",
  "pushing/shoving a person",
  "out of seat",
  "hand-flapping repeatedly",
  "body-rocking",
  "pulling or twirling hair",
  "crying",
  "screaming",
  "whimpering",
  "echolalia",
  "laughing",
];

type ManualAnnotationPayload = {
  id: string;
  behavior: string;
  startSec: number;
  endSec: number;
  details: string;
  createdAt?: string;
};

export default function SessionVideoPlayer({
  icd,
  uploadEpoch,
  topPercent,
  leftPercent,
  rightPercent,
  manropeClassName,
}: SessionVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const behaviorTableRef = useRef<HTMLElement | null>(null);
  const [isPausedOverlayVisible, setIsPausedOverlayVisible] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [zoomRatio, setZoomRatio] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [analysisBehaviors, setAnalysisBehaviors] = useState<AnalysisBehavior[]>([]);
  const [selectedBehaviorFilter, setSelectedBehaviorFilter] = useState<string | null>(null);
  const [manualBehaviors, setManualBehaviors] = useState<BehaviorRow[]>([]);
  const [deletedBehaviorIds, setDeletedBehaviorIds] = useState<Set<string>>(new Set());
  const [isAddBehaviorOpen, setIsAddBehaviorOpen] = useState(false);
  const [addBehaviorName, setAddBehaviorName] = useState(ALL_BEHAVIOR_OPTIONS[0]);
  const [addStartSecInput, setAddStartSecInput] = useState("0");
  const [addEndSecInput, setAddEndSecInput] = useState("2");
  const [addBehaviorError, setAddBehaviorError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; source: "detected" | "manual" } | null>(null);
  const [isDeletingBehavior, setIsDeletingBehavior] = useState(false);
  const [isNotesBoxVisible, setIsNotesBoxVisible] = useState(true);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [reviewNotesError, setReviewNotesError] = useState("");
  const [notesTopPx, setNotesTopPx] = useState<number | null>(null);

  const videoSrc = `/api/children/session-video?icd=${encodeURIComponent(icd)}&uploadEpoch=${encodeURIComponent(uploadEpoch)}`;

  useEffect(() => {
    let cancelled = false;
    const loadAnalysis = async () => {
      try {
        const res = await fetch(
          `/api/children/session-analysis?icd=${encodeURIComponent(icd)}&uploadEpoch=${encodeURIComponent(uploadEpoch)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { analysis?: { behaviors?: AnalysisBehavior[] } | null };
        if (cancelled) return;
        setAnalysisBehaviors(Array.isArray(data.analysis?.behaviors) ? data.analysis.behaviors : []);
      } catch {
        if (!cancelled) {
          setAnalysisBehaviors([]);
        }
      }
    };
    void loadAnalysis();
    return () => {
      cancelled = true;
    };
  }, [icd, uploadEpoch]);

  useEffect(() => {
    const updateNotesTop = () => {
      if (!behaviorTableRef.current) return;
      setNotesTopPx(behaviorTableRef.current.offsetTop + behaviorTableRef.current.offsetHeight + 64.11);
    };

    updateNotesTop();

    const resizeObserver = new ResizeObserver(() => {
      updateNotesTop();
    });
    if (behaviorTableRef.current) {
      resizeObserver.observe(behaviorTableRef.current);
    }
    window.addEventListener("resize", updateNotesTop);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateNotesTop);
    };
  }, [analysisBehaviors.length, selectedBehaviorFilter, isNotesBoxVisible]);

  useEffect(() => {
    let cancelled = false;
    const loadReviewNotes = async () => {
      try {
        const res = await fetch(
          `/api/children/session-notes?icd=${encodeURIComponent(icd)}&uploadEpoch=${encodeURIComponent(uploadEpoch)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { reviewNotes?: string };
        if (cancelled) return;
        const existing = String(data.reviewNotes || "");
        if (existing.trim()) {
          setReviewNotes(existing);
          setIsNotesBoxVisible(false);
        }
      } catch {
        // Keep box visible on load failure.
      }
    };
    void loadReviewNotes();
    return () => {
      cancelled = true;
    };
  }, [icd, uploadEpoch]);

  useEffect(() => {
    let cancelled = false;
    const loadManualAnnotations = async () => {
      try {
        const res = await fetch(
          `/api/children/session-annotations?icd=${encodeURIComponent(icd)}&uploadEpoch=${encodeURIComponent(uploadEpoch)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { manualAnnotations?: ManualAnnotationPayload[] };
        if (cancelled) return;
        const mapped = Array.isArray(data.manualAnnotations)
          ? data.manualAnnotations
              .map((item) => {
                const behavior = String(item.behavior || "").trim();
                const startSec = Number(item.startSec);
                const endSec = Number(item.endSec);
                if (!behavior || !Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
                  return null;
                }
                return {
                  id: String(item.id || "").trim(),
                  behavior,
                  category: categoryByBehavior(behavior),
                  startSec,
                  endSec,
                  details: String(item.details || "").trim() || `Manually added ${behavior}.`,
                  source: "manual" as const,
                };
              })
              .filter((row): row is NonNullable<typeof row> => row !== null)
          : [];
        setManualBehaviors(mapped);
      } catch {
        if (!cancelled) {
          setManualBehaviors([]);
        }
      }
    };
    void loadManualAnnotations();
    return () => {
      cancelled = true;
    };
  }, [icd, uploadEpoch]);

  const handleTogglePlayback = async () => {
    if (hasError || !videoRef.current) {
      return;
    }
    if (videoRef.current.paused) {
      try {
        await videoRef.current.play();
        setIsPausedOverlayVisible(false);
      } catch {
        setIsPausedOverlayVisible(true);
      }
      return;
    }
    videoRef.current.pause();
    setIsPausedOverlayVisible(true);
  };

  const handleSeek = (deltaSeconds: number) => {
    if (!videoRef.current) return;
    const nextTime = Math.max(0, videoRef.current.currentTime + deltaSeconds);
    videoRef.current.currentTime = nextTime;
  };

  const seekToTime = (targetTimeSec: number) => {
    if (!videoRef.current || !Number.isFinite(targetTimeSec)) return;
    const bounded = Math.max(0, targetTimeSec);
    videoRef.current.currentTime = bounded;
    setCurrentTimeSec(bounded);
  };

  const formatTimeLabel = (seconds: number | null | undefined) => {
    if (!Number.isFinite(seconds) || Number(seconds) < 0) {
      return "--:--";
    }
    const totalSeconds = Math.floor(Number(seconds));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const playLeftPercent = 5.555555555555555;
  const playRightPercent = 88.54166666666667;
  const rewindLeftPercent = 13.125;
  const rewindRightPercent = 82.08333333333334;
  const forwardLeftPercent = 18.75;
  const smallButtonWidthPercent = rewindRightPercent - rewindLeftPercent <= 0 ? 4.791666666666667 : 100 - rewindLeftPercent - rewindRightPercent;
  const videoWidthPercent = 100 - leftPercent - rightPercent;
  const controlsTopCss = `calc(${topPercent}% + ${(videoWidthPercent * 9) / 16}vw + 10px)`;
  const addBehaviorButtonWidthPx = 145;
  const addBehaviorButtonHeightPx = 40;
  const summaryBoxLeftPercent = playLeftPercent;
  const summaryBoxWidthPx = 1280;
  const summaryBoxHeightPx = 308;
  const summaryBoxTopCss = `calc(${controlsTopCss} + ${addBehaviorButtonHeightPx}px + 40px)`;
  const timelineZoomLabelLeftPx = 1014;
  const timelineZoomSliderLeftPx = timelineZoomLabelLeftPx + 120;
  const tableTopCss = `calc(${summaryBoxTopCss} + ${summaryBoxHeightPx}px + 24px)`;
  const tableLeftPercent = summaryBoxLeftPercent;
  const addPopoverTopCss = `calc(${controlsTopCss} + ${addBehaviorButtonHeightPx}px + 8px)`;

  const zoomWindowSeconds = useMemo(() => {
    if (!Number.isFinite(videoDurationSec) || !videoDurationSec || videoDurationSec <= 0) {
      return null;
    }
    if (videoDurationSec <= 30) {
      return videoDurationSec;
    }
    const clampedRatio = Math.max(0, Math.min(1, zoomRatio));
    return videoDurationSec - (videoDurationSec - 30) * clampedRatio;
  }, [videoDurationSec, zoomRatio]);

  const viewportStartSec = useMemo(() => {
    if (!videoDurationSec || !zoomWindowSeconds) {
      return 0;
    }
    if (videoDurationSec <= zoomWindowSeconds) {
      return 0;
    }
    const centered = currentTimeSec - zoomWindowSeconds / 2;
    return Math.max(0, Math.min(centered, videoDurationSec - zoomWindowSeconds));
  }, [videoDurationSec, zoomWindowSeconds, currentTimeSec]);

  const viewportEndSec = useMemo(() => {
    if (!videoDurationSec || !zoomWindowSeconds) {
      return 0;
    }
    return Math.min(videoDurationSec, viewportStartSec + zoomWindowSeconds);
  }, [videoDurationSec, zoomWindowSeconds, viewportStartSec]);

  const viewingStartLabel = formatTimeLabel(viewportStartSec);
  const viewingEndLabel = formatTimeLabel(viewportEndSec || videoDurationSec);

  const categoryByBehavior = (behavior: string) => {
    const key = behavior.trim().toLowerCase();
    if (["hitting the therapist with hand", "kicking the therapist with foot", "pushing/shoving a person", "throwing objects"].includes(key)) {
      return "Aggression";
    }
    if (["non compliance", "out of seat"].includes(key)) {
      return "Disruptive Behaviors";
    }
    if (["hand-flapping repeatedly", "body-rocking", "pulling or twirling hair"].includes(key)) {
      return "Motor Stereotypy";
    }
    if (["crying", "screaming", "whimpering", "echolalia", "laughing"].includes(key)) {
      return "Vocal Stereotypy";
    }
    return "Behavior";
  };

  const detectedRows = useMemo<BehaviorRow[]>(() => {
    return analysisBehaviors
      .map((item, index) => {
        const behavior = String(item.behavior || "").trim();
        const startSec = Number(item.startSec);
        const endSec = Number(item.endSec);
        if (!behavior || !Number.isFinite(startSec)) {
          return null;
        }
        const safeEndSec = Number.isFinite(endSec) ? endSec : startSec;
        return {
          id: `detected-${behavior}-${startSec}-${index}`,
          behavior,
          category: categoryByBehavior(behavior),
          startSec,
          endSec: Math.max(safeEndSec, startSec),
          details: String(item.notes || "").trim() || `${behavior} detected in this interval.`,
          source: "detected",
        };
      })
      .filter((row): row is BehaviorRow => Boolean(row));
  }, [analysisBehaviors]);

  const visibleDetections = useMemo(() => {
    if (!zoomWindowSeconds || viewportEndSec <= viewportStartSec) {
      return [];
    }
    const windowLength = viewportEndSec - viewportStartSec;
    return detectedRows
      .filter((row) => !deletedBehaviorIds.has(row.id))
      .map((detection) => {
        const start = detection.startSec;
        const end = detection.endSec;
        const clippedStart = Math.max(viewportStartSec, start);
        const clippedEnd = Math.min(viewportEndSec, Math.max(end, start + 0.05));
        if (clippedEnd <= viewportStartSec || clippedStart >= viewportEndSec || clippedEnd <= clippedStart) {
          return null;
        }
        const leftPercent = ((clippedStart - viewportStartSec) / windowLength) * 100;
        const widthPercent = Math.max(0.8, ((clippedEnd - clippedStart) / windowLength) * 100);
        return {
          id: detection.id,
          behavior: detection.behavior,
          startSec: start,
          leftPercent,
          widthPercent,
        };
      })
      .filter(
        (
          item,
        ): item is { id: string; behavior: string; startSec: number; leftPercent: number; widthPercent: number } =>
          Boolean(item),
      );
  }, [detectedRows, deletedBehaviorIds, viewportStartSec, viewportEndSec, zoomWindowSeconds]);

  const currentTimePercentInWindow = useMemo(() => {
    if (!zoomWindowSeconds || viewportEndSec <= viewportStartSec) {
      return 0;
    }
    const clamped = Math.max(viewportStartSec, Math.min(currentTimeSec, viewportEndSec));
    return ((clamped - viewportStartSec) / (viewportEndSec - viewportStartSec)) * 100;
  }, [currentTimeSec, viewportStartSec, viewportEndSec, zoomWindowSeconds]);
  const zoomSliderStyle: CSSProperties & Record<"--zoom-progress", string> = {
    top: "30px",
    left: `${timelineZoomSliderLeftPx}px`,
    right: "24px",
    "--zoom-progress": `${Math.round(zoomRatio * 100)}%`,
  };

  const behaviorRows = useMemo(() => {
    return [...detectedRows, ...manualBehaviors]
      .filter((row) => !deletedBehaviorIds.has(row.id))
      .sort((a, b) => a.startSec - b.startSec);
  }, [detectedRows, manualBehaviors, deletedBehaviorIds]);

  const behaviorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of behaviorRows) {
      counts.set(row.behavior, (counts.get(row.behavior) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [behaviorRows]);

  const filteredRows = useMemo(() => {
    if (!selectedBehaviorFilter) {
      return behaviorRows;
    }
    return behaviorRows.filter((row) => row.behavior === selectedBehaviorFilter);
  }, [behaviorRows, selectedBehaviorFilter]);

  const visibleManualDetections = useMemo(() => {
    if (!zoomWindowSeconds || viewportEndSec <= viewportStartSec) {
      return [];
    }
    const windowLength = viewportEndSec - viewportStartSec;
    return manualBehaviors
      .filter((row) => !deletedBehaviorIds.has(row.id))
      .map((row) => {
        const clippedStart = Math.max(viewportStartSec, row.startSec);
        const clippedEnd = Math.min(viewportEndSec, Math.max(row.endSec, row.startSec + 0.05));
        if (clippedEnd <= viewportStartSec || clippedStart >= viewportEndSec || clippedEnd <= clippedStart) {
          return null;
        }
        return {
          ...row,
          leftPercent: ((clippedStart - viewportStartSec) / windowLength) * 100,
        };
      })
      .filter((row): row is BehaviorRow & { leftPercent: number } => Boolean(row));
  }, [manualBehaviors, deletedBehaviorIds, viewportStartSec, viewportEndSec, zoomWindowSeconds]);

  const handleAddBehavior = async () => {
    const startSec = Number(addStartSecInput);
    const endSec = Number(addEndSecInput);
    const maxEnd = Number.isFinite(videoDurationSec) && videoDurationSec ? videoDurationSec : Infinity;
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      setAddBehaviorError("Enter valid numeric timestamps.");
      return;
    }
    if (startSec < 0 || endSec <= startSec || endSec > maxEnd) {
      setAddBehaviorError("Use a valid in-range start/end timestamp.");
      return;
    }
    const behavior = addBehaviorName.trim();
    if (!behavior) {
      setAddBehaviorError("Select a behavior.");
      return;
    }
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const res = await fetch("/api/children/session-annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          icd,
          uploadEpoch,
          annotation: {
            id,
            behavior,
            startSec,
            endSec,
            details: `Manually added ${behavior}.`,
          },
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string };
        setAddBehaviorError(payload.message || "Failed to save annotation.");
        return;
      }
      const payload = (await res.json()) as { manualAnnotations?: ManualAnnotationPayload[] };
      const mapped = Array.isArray(payload.manualAnnotations)
        ? payload.manualAnnotations
            .map((item) => {
              const rowBehavior = String(item.behavior || "").trim();
              const rowStart = Number(item.startSec);
              const rowEnd = Number(item.endSec);
              if (!rowBehavior || !Number.isFinite(rowStart) || !Number.isFinite(rowEnd) || rowEnd <= rowStart) {
                return null;
              }
              return {
                id: String(item.id || "").trim(),
                behavior: rowBehavior,
                category: categoryByBehavior(rowBehavior),
                startSec: rowStart,
                endSec: rowEnd,
                details: String(item.details || "").trim() || `Manually added ${rowBehavior}.`,
                source: "manual" as const,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null)
        : [];
      setManualBehaviors(mapped);
      setAddBehaviorError("");
      setIsAddBehaviorOpen(false);
    } catch {
      setAddBehaviorError("Failed to save annotation.");
    }
  };

  const handleDeleteBehavior = async (rowId: string, source: "detected" | "manual") => {
    const shouldDelete = window.confirm("Delete this behavior?");
    if (!shouldDelete) {
      return;
    }

    if (source === "manual") {
      try {
        const res = await fetch("/api/children/session-annotations", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            icd,
            uploadEpoch,
            id: rowId,
          }),
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { manualAnnotations?: ManualAnnotationPayload[] };
        const mapped = Array.isArray(payload.manualAnnotations)
          ? payload.manualAnnotations
              .map((item) => {
                const behavior = String(item.behavior || "").trim();
                const startSec = Number(item.startSec);
                const endSec = Number(item.endSec);
                if (!behavior || !Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
                  return null;
                }
                return {
                  id: String(item.id || "").trim(),
                  behavior,
                  category: categoryByBehavior(behavior),
                  startSec,
                  endSec,
                  details: String(item.details || "").trim() || `Manually added ${behavior}.`,
                  source: "manual" as const,
                };
              })
              .filter((row): row is NonNullable<typeof row> => row !== null)
          : [];
        setManualBehaviors(mapped);
        return;
      } catch {
        return;
      }
    }
    setDeletedBehaviorIds((current) => {
      const next = new Set(current);
      next.add(rowId);
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    setIsDeletingBehavior(true);
    try {
      await handleDeleteBehavior(pendingDelete.id, pendingDelete.source);
      setPendingDelete(null);
    } finally {
      setIsDeletingBehavior(false);
    }
  };

  const handleSaveReviewNotes = async () => {
    const value = reviewNotes.trim();
    if (!value) {
      setReviewNotesError("Please enter notes before saving.");
      return;
    }
    setIsSavingNotes(true);
    setReviewNotesError("");
    try {
      const res = await fetch("/api/children/session-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          icd,
          uploadEpoch,
          reviewNotes: value,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string };
        setReviewNotesError(payload.message || "Failed to save notes.");
        return;
      }
      setIsNotesBoxVisible(false);
    } catch {
      setReviewNotesError("Failed to save notes.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  return (
    <>
      <div
        className="absolute overflow-hidden rounded-[7.18px] bg-black"
        style={{
          top: `${topPercent}%`,
          left: `${leftPercent}%`,
          right: `${rightPercent}%`,
          aspectRatio: "16 / 9",
          cursor: hasError ? "default" : "pointer",
        }}
        onClick={() => {
          void handleTogglePlayback();
        }}
        role="button"
        aria-label="Session video player"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void handleTogglePlayback();
          }
        }}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          className="h-full w-full object-contain"
          controls={false}
          preload="auto"
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setVideoDurationSec(videoRef.current.duration);
            }
          }}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTimeSec(videoRef.current.currentTime);
            }
          }}
          onEnded={() => setIsPausedOverlayVisible(true)}
          onPause={() => setIsPausedOverlayVisible(true)}
          onPlay={() => setIsPausedOverlayVisible(false)}
          onError={() => {
            setHasError(true);
            setIsPausedOverlayVisible(false);
          }}
        />
        {isPausedOverlayVisible && !hasError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Image src="/play.svg" alt="Play" width={78} height={78} priority />
          </div>
        ) : null}
        {hasError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 px-4 text-center text-sm text-white">
            Processed video is not available yet.
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className={`${manropeClassName} absolute`}
        style={{
          top: controlsTopCss,
          left: `${playLeftPercent}%`,
          right: `${playRightPercent}%`,
          border: "none",
          borderRadius: "8px",
          backgroundColor: "#0A52C7",
          color: "#FFFFFF",
          fontWeight: 600,
          fontStyle: "normal",
          fontSize: "14px",
          lineHeight: "20px",
          letterSpacing: "0px",
          textAlign: "center",
          verticalAlign: "middle",
          padding: "8px 10px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          cursor: "pointer",
        }}
        onClick={() => {
          void handleTogglePlayback();
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 5L19 12L7 19V5Z" stroke="#FFFFFF" strokeWidth="2" fill="none" />
        </svg>
        Play
      </button>

      <button
        type="button"
        className={`${manropeClassName} absolute`}
        style={{
          top: controlsTopCss,
          left: `${rewindLeftPercent}%`,
          right: `${rewindRightPercent}%`,
          border: "1px solid #DEE0E3",
          borderRadius: "8px",
          backgroundColor: "#FFFFFF",
          color: "#121417",
          fontWeight: 600,
          fontStyle: "normal",
          fontSize: "14px",
          lineHeight: "20px",
          letterSpacing: "0px",
          textAlign: "center",
          verticalAlign: "middle",
          padding: "8px 10px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          cursor: "pointer",
        }}
        onClick={() => {
          handleSeek(-5);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6V18" stroke="#121417" strokeWidth="2" strokeLinecap="round" />
          <path d="M19 6L11 12L19 18V6Z" stroke="#121417" strokeWidth="2" fill="none" />
        </svg>
        5s
      </button>

      <button
        type="button"
        className={`${manropeClassName} absolute`}
        style={{
          top: controlsTopCss,
          left: `${forwardLeftPercent}%`,
          width: `${smallButtonWidthPercent}%`,
          border: "1px solid #DEE0E3",
          borderRadius: "8px",
          backgroundColor: "#FFFFFF",
          color: "#121417",
          fontWeight: 600,
          fontStyle: "normal",
          fontSize: "14px",
          lineHeight: "20px",
          letterSpacing: "0px",
          textAlign: "center",
          verticalAlign: "middle",
          padding: "8px 10px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          cursor: "pointer",
        }}
        onClick={() => {
          handleSeek(5);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 6V18" stroke="#121417" strokeWidth="2" strokeLinecap="round" />
          <path d="M5 6L13 12L5 18V6Z" stroke="#121417" strokeWidth="2" fill="none" />
        </svg>
        5s
      </button>

      <button
        type="button"
        className={`${manropeClassName} absolute`}
        style={{
          top: controlsTopCss,
          right: `${rightPercent}%`,
          width: `${addBehaviorButtonWidthPx}px`,
          height: `${addBehaviorButtonHeightPx}px`,
          border: "1px solid #0A52C7",
          borderRadius: "8px",
          backgroundColor: "#FFFFFF",
          color: "#616E8A",
          fontWeight: 500,
          fontStyle: "normal",
          fontSize: "14px",
          lineHeight: "20px",
          letterSpacing: "0px",
          verticalAlign: "middle",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          cursor: "pointer",
        }}
        onClick={() => {
          const defaultStart = Math.max(0, currentTimeSec);
          const defaultEnd = Number.isFinite(videoDurationSec)
            ? Math.min(videoDurationSec || defaultStart + 2, defaultStart + 2)
            : defaultStart + 2;
          setAddStartSecInput(defaultStart.toFixed(2));
          setAddEndSecInput(defaultEnd.toFixed(2));
          setAddBehaviorError("");
          setIsAddBehaviorOpen((current) => !current);
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5V19" stroke="#616E8A" strokeWidth="2" strokeLinecap="round" />
          <path d="M5 12H19" stroke="#616E8A" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Add Behavior
      </button>
      {isAddBehaviorOpen ? (
        <div
          className={`${manropeClassName} absolute z-20 rounded-[10px] border border-[#DEE0E3] bg-white p-3 shadow-md`}
          style={{
            top: addPopoverTopCss,
            right: `${rightPercent}%`,
            width: "260px",
          }}
        >
          <p className="m-0 text-[13px] font-semibold text-[#344054]">Add behavior</p>
          <label className="mt-2 block text-[12px] font-medium text-[#475467]">Behavior</label>
          <select
            className="mt-1 w-full rounded-[8px] border border-[#DEE0E3] px-2 py-2 text-[13px] text-[#344054]"
            value={addBehaviorName}
            onChange={(event) => setAddBehaviorName(event.currentTarget.value)}
          >
            {ALL_BEHAVIOR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[12px] font-medium text-[#475467]">Start (s)</label>
              <input
                className="mt-1 w-full rounded-[8px] border border-[#DEE0E3] px-2 py-2 text-[13px] text-[#344054]"
                value={addStartSecInput}
                onChange={(event) => setAddStartSecInput(event.currentTarget.value)}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#475467]">End (s)</label>
              <input
                className="mt-1 w-full rounded-[8px] border border-[#DEE0E3] px-2 py-2 text-[13px] text-[#344054]"
                value={addEndSecInput}
                onChange={(event) => setAddEndSecInput(event.currentTarget.value)}
              />
            </div>
          </div>
          {addBehaviorError ? (
            <p className="mt-2 m-0 text-[12px] text-[#DC2626]">{addBehaviorError}</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-[8px] border border-[#DEE0E3] px-3 py-1 text-[12px] font-medium text-[#475467]"
              onClick={() => setIsAddBehaviorOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-[8px] bg-[#0A52C7] px-3 py-1 text-[12px] font-medium text-white"
              onClick={handleAddBehavior}
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="absolute rounded-[12px] border border-[#DEE0E3] bg-white"
        style={{
          top: summaryBoxTopCss,
          left: `${summaryBoxLeftPercent}%`,
          width: `${summaryBoxWidthPx}px`,
          height: `${summaryBoxHeightPx}px`,
        }}
      >
        <p
          className={`${manropeClassName} absolute m-0`}
          style={{
            top: "24px",
            left: "24px",
            color: "#101828",
            fontWeight: 600,
            fontStyle: "normal",
            fontSize: "18px",
            lineHeight: "28px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          Timeline
        </p>
        <p
          className={`${manropeClassName} absolute m-0`}
          style={{
            top: "24px",
            left: "482.5px",
            color: "#475467",
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "20px",
            letterSpacing: "0px",
            textAlign: "center",
            verticalAlign: "middle",
          }}
        >
          {`Viewing: ${viewingStartLabel} - ${viewingEndLabel}`}
        </p>
        <p
          className={`${manropeClassName} absolute m-0`}
          style={{
            top: "24px",
            left: `${timelineZoomLabelLeftPx}px`,
            color: "#475467",
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "14px",
            lineHeight: "20px",
            letterSpacing: "0px",
            textAlign: "center",
            verticalAlign: "middle",
          }}
        >
          Timeline Zoom:
        </p>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(zoomRatio * 100)}
          disabled={!videoDurationSec || videoDurationSec <= 30}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            if (Number.isFinite(value)) {
              setZoomRatio(Math.max(0, Math.min(1, value / 100)));
            }
          }}
          className="timeline-zoom-slider absolute"
          style={zoomSliderStyle}
          aria-label="Timeline zoom"
        />

        <div className="absolute left-[24px] right-[24px] top-[68px] h-[12px] rounded-full bg-[#EAECF0]">
          {visibleDetections.map((item, index) => (
            <div
              key={`${item.behavior}-${index}`}
              className="absolute top-0 h-full rounded-full bg-[#93C5FD]"
              style={{
                left: `${item.leftPercent}%`,
                width: `${item.widthPercent}%`,
              }}
            />
          ))}
          <div
            className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#EF4444]"
            style={{ left: `${currentTimePercentInWindow}%` }}
          />
          <div
            className="absolute top-[-16px] h-[16px] w-[2px] -translate-x-1/2 bg-[#EF4444]"
            style={{ left: `${currentTimePercentInWindow}%` }}
          />
        </div>

        <div className="absolute left-[24px] right-[24px] top-[92px] flex justify-between text-[20px] text-[#98A2B3]">
          <span className={`${manropeClassName} text-[14px] font-normal text-[#667085]`}>
            {formatTimeLabel(viewportStartSec)}
          </span>
          <span className={`${manropeClassName} text-[14px] font-normal text-[#667085]`}>
            {formatTimeLabel(viewportStartSec + (viewportEndSec - viewportStartSec) * 0.25)}
          </span>
          <span className={`${manropeClassName} text-[14px] font-normal text-[#667085]`}>
            {formatTimeLabel(viewportStartSec + (viewportEndSec - viewportStartSec) * 0.5)}
          </span>
          <span className={`${manropeClassName} text-[14px] font-normal text-[#667085]`}>
            {formatTimeLabel(viewportStartSec + (viewportEndSec - viewportStartSec) * 0.75)}
          </span>
          <span className={`${manropeClassName} text-[14px] font-normal text-[#667085]`}>
            {formatTimeLabel(viewportEndSec)}
          </span>
        </div>

        <p
          className={`${manropeClassName} absolute left-[24px] top-[150px] m-0 text-[#344054]`}
          style={{
            fontWeight: 500,
            fontStyle: "normal",
            fontSize: "12px",
            lineHeight: "16px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          AI Detections
        </p>
        <div className="absolute left-[24px] right-[24px] top-[182px] h-[42px] rounded-[8px] bg-[#F2F4F7]">
          {visibleDetections.map((item, index) => {
            const colorPalette: Record<string, string> = {
              "non compliance": "#7C3AED",
              "throwing objects": "#EA580C",
              "hitting the therapist with hand": "#0891B2",
              "kicking the therapist with foot": "#0EA5E9",
              "pulling or twirling hair": "#16A34A",
              "pushing/shoving a person": "#2563EB",
              "out of seat": "#0EA5E9",
              "hand-flapping repeatedly": "#10B981",
              "body-rocking": "#06B6D4",
              crying: "#9333EA",
              screaming: "#DC2626",
              whimpering: "#8B5CF6",
              echolalia: "#6366F1",
              laughing: "#059669",
            };
            const backgroundColor = colorPalette[item.behavior.toLowerCase()] || "#64748B";
            const label = item.behavior.charAt(0).toUpperCase();
            return (
              <div
                key={`lane-${item.behavior}-${index}`}
                className="absolute top-1/2 flex h-[30px] w-[22px] -translate-y-1/2 items-center justify-center rounded-[10px] text-[12px] font-semibold text-white"
                style={{
                  left: `${item.leftPercent}%`,
                  backgroundColor,
                  cursor: "pointer",
                }}
                title={item.behavior}
                role="button"
                tabIndex={0}
                onClick={() => {
                  seekToTime(item.startSec);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    seekToTime(item.startSec);
                  }
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
        <p
          className={`${manropeClassName} absolute right-[24px] top-[150px] m-0 text-[#667085]`}
          style={{
            fontWeight: 500,
            fontStyle: "normal",
            fontSize: "12px",
            lineHeight: "16px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          {`${visibleDetections.length}/${detectedRows.filter((row) => !deletedBehaviorIds.has(row.id)).length}`}
        </p>

        <p
          className={`${manropeClassName} absolute left-[24px] top-[232px] m-0 text-[#344054]`}
          style={{
            fontWeight: 500,
            fontStyle: "normal",
            fontSize: "12px",
            lineHeight: "16px",
            letterSpacing: "0px",
            verticalAlign: "middle",
          }}
        >
          Manual Annotations
        </p>
        <div className="absolute left-[24px] right-[24px] top-[264px] h-[42px] rounded-[8px] bg-[#D0D5DD]">
          {visibleManualDetections.length === 0 ? (
            <p
              className={`${manropeClassName} m-0 pt-[12px] text-center text-[#667085]`}
              style={{
                fontWeight: 500,
                fontStyle: "normal",
                fontSize: "12px",
                lineHeight: "16px",
                letterSpacing: "0px",
                verticalAlign: "middle",
              }}
            >
              No manual annotations
            </p>
          ) : (
            visibleManualDetections.map((item) => (
              <button
                key={item.id}
                type="button"
                className="absolute top-1/2 h-[26px] w-[20px] -translate-y-1/2 rounded-[8px] bg-[#2563EB] text-[10px] font-semibold text-white"
                style={{ left: `${item.leftPercent}%` }}
                onClick={() => seekToTime(item.startSec)}
                title={item.behavior}
              >
                {item.behavior.charAt(0).toUpperCase()}
              </button>
            ))
          )}
        </div>
      </div>

      <section
        ref={behaviorTableRef}
        className="absolute rounded-[12px] border border-[#DEE0E3] bg-white p-6"
        style={{
          top: tableTopCss,
          left: `${tableLeftPercent}%`,
          width: `${summaryBoxWidthPx}px`,
        }}
      >
        <p className={`${manropeClassName} m-0 text-[36px] font-semibold leading-[42px] text-[#1F2937]`}>
          Total behaviors -{" "}
          <span className="text-[#2563EB]">{behaviorRows.length}</span>
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={`${manropeClassName} rounded-full border px-4 py-2 text-[14px] font-medium`}
            style={{
              borderColor: selectedBehaviorFilter === null ? "#2563EB" : "#DEE0E3",
              color: selectedBehaviorFilter === null ? "#2563EB" : "#344054",
              backgroundColor: "#F8FAFC",
            }}
            onClick={() => setSelectedBehaviorFilter(null)}
          >
            All
          </button>
          {behaviorCounts.map(([behavior, count]) => (
            <button
              key={behavior}
              type="button"
              className={`${manropeClassName} rounded-full border px-4 py-2 text-[14px] font-medium`}
              style={{
                borderColor: selectedBehaviorFilter === behavior ? "#2563EB" : "#DEE0E3",
                color: selectedBehaviorFilter === behavior ? "#2563EB" : "#344054",
                backgroundColor: "#F8FAFC",
              }}
              onClick={() => setSelectedBehaviorFilter(behavior)}
            >
              <span className="mr-2 text-[#2563EB]">{String(count).padStart(2, "0")}</span>
              {behavior}
            </button>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-[12px] border border-[#DEE0E3]">
          <div className="max-h-[620px] overflow-auto">
            <table className={`${manropeClassName} w-full border-collapse`}>
              <thead className="sticky top-0 z-10 bg-[#F9FAFB]">
                <tr>
                  <th className="border-b border-[#E5E7EB] px-6 py-4 text-left text-[14px] font-semibold text-[#667085]">Timestamp</th>
                  <th className="border-b border-[#E5E7EB] px-6 py-4 text-left text-[14px] font-semibold text-[#667085]">Category</th>
                  <th className="border-b border-[#E5E7EB] px-6 py-4 text-left text-[14px] font-semibold text-[#667085]">Behavior</th>
                  <th className="border-b border-[#E5E7EB] px-6 py-4 text-left text-[14px] font-semibold text-[#667085]">Details</th>
                  <th className="border-b border-[#E5E7EB] px-6 py-4 text-left text-[14px] font-semibold text-[#667085]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-[14px] font-medium text-[#667085]">
                      No behaviors for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-[#F8FAFC]"
                      onClick={() => seekToTime(row.startSec)}
                    >
                      <td className="border-b border-[#EAECF0] px-6 py-4 text-[14px] font-semibold text-[#2563EB]">
                        {formatTimeLabel(row.startSec)}
                      </td>
                      <td className="border-b border-[#EAECF0] px-6 py-4 text-[14px] font-medium text-[#475467]">
                        <span className="inline-block whitespace-nowrap rounded-full border border-[#A4C2F4] px-3 py-[2px]">{row.category}</span>
                      </td>
                      <td className="border-b border-[#EAECF0] px-6 py-4 text-[14px] font-medium text-[#344054]">
                        {row.behavior}
                      </td>
                      <td className="border-b border-[#EAECF0] px-6 py-4 text-[14px] font-medium text-[#475467]">
                        {row.details}
                      </td>
                      <td className="border-b border-[#EAECF0] px-6 py-4 text-[14px] font-medium text-[#475467]">
                        <button
                          type="button"
                          className="rounded-[8px] border border-[#DEE0E3] px-3 py-1 text-[12px] font-semibold text-[#344054]"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDelete({ id: row.id, source: row.source });
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isNotesBoxVisible ? (
        <section
          className={`${manropeClassName} absolute`}
          style={{
            top: notesTopPx !== null ? `${notesTopPx}px` : `calc(${tableTopCss} + 64.11px)`,
            left: `${tableLeftPercent}%`,
            width: `${summaryBoxWidthPx}px`,
          }}
        >
          <p
            className="m-0 text-[#111827]"
            style={{
              fontWeight: 700,
              fontStyle: "normal",
              fontSize: "28px",
              lineHeight: "33.76px",
              letterSpacing: "0px",
            }}
          >
            Notes
            <span className="font-normal text-[#6B7280]">(Observations)</span>
          </p>
          <div className="mt-4 rounded-[12px] border border-[#DEE0E3] bg-white p-4">
            <textarea
              className="h-[120px] w-full resize-none border-none text-[#344054] outline-none placeholder:text-[#64748B]"
              style={{
                fontWeight: 400,
                fontStyle: "normal",
                fontSize: "16.88px",
                lineHeight: "25.32px",
                letterSpacing: "0px",
              }}
              placeholder="Enter recommendations and notes here"
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.currentTarget.value)}
            />
          </div>
          {reviewNotesError ? (
            <p className="mt-2 mb-0 text-[14px] text-[#DC2626]">{reviewNotesError}</p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="h-[44px] w-[196px] rounded-[7.18px] border border-[#0A52C7] bg-white text-[#0A52C7]"
              style={{
                fontWeight: 700,
                fontStyle: "normal",
                fontSize: "14.36px",
                lineHeight: "21.54px",
                letterSpacing: "0px",
              }}
              onClick={() => setIsNotesBoxVisible(false)}
              disabled={isSavingNotes}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-[44px] w-[196px] rounded-[7.18px] border border-[#0A52C7] bg-[#0A52C7] text-white"
              style={{
                fontWeight: 700,
                fontStyle: "normal",
                fontSize: "14.36px",
                lineHeight: "21.54px",
                letterSpacing: "0px",
              }}
              onClick={() => {
                void handleSaveReviewNotes();
              }}
              disabled={isSavingNotes}
            >
              {isSavingNotes ? "Saving..." : "Save"}
            </button>
          </div>
        </section>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-4">
          <div
            className={`${manropeClassName} w-full max-w-[420px] rounded-[12px] border border-[#DEE0E3] bg-white p-5`}
          >
            <p className="m-0 text-[18px] font-semibold text-[#121417]">Delete behavior?</p>
            <p className="mt-2 mb-0 text-[14px] font-normal text-[#475467]">
              This action will remove the behavior from the timeline and table.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-[8px] border border-[#DEE0E3] px-4 py-2 text-[13px] font-semibold text-[#344054]"
                onClick={() => setPendingDelete(null)}
                disabled={isDeletingBehavior}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-[8px] bg-[#DC2626] px-4 py-2 text-[13px] font-semibold text-white"
                onClick={() => {
                  void handleConfirmDelete();
                }}
                disabled={isDeletingBehavior}
              >
                {isDeletingBehavior ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

