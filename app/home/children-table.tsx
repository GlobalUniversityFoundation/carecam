"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter, Manrope } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400"],
});

type HomeRow = {
  clientName: string;
  age: string;
  diagnosis: string;
  therapist: string;
  status: string;
  details: string;
  icdCode: string;
};

type ChildrenTableProps = {
  searchBoxTopPercent: number;
  searchBoxLeftPercent: number;
  searchBoxWidthPercent: number;
  searchBoxHeightPercent: number;
  tableBodyTopPercent: number;
  secondReferenceBoxLeftPercent: number;
  secondReferenceBoxWidthPercent: number;
  visibleEntryRows: number;
  entryRowHeightPx: number;
  rowTextLeftOffset: string;
};

export default function ChildrenTable({
  searchBoxTopPercent,
  searchBoxLeftPercent,
  searchBoxWidthPercent,
  searchBoxHeightPercent,
  tableBodyTopPercent,
  secondReferenceBoxLeftPercent,
  secondReferenceBoxWidthPercent,
  visibleEntryRows,
  entryRowHeightPx,
  rowTextLeftOffset,
}: ChildrenTableProps) {
  const router = useRouter();
  const menuWidthVw = 6.180555555555555;
  const menuHeightVh = 9.441170750654464;
  const [searchQuery, setSearchQuery] = useState("");
  const [childrenRows, setChildrenRows] = useState<HomeRow[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState(true);
  const [isDeletingChild, setIsDeletingChild] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeRow | null>(null);
  const [openMenuRow, setOpenMenuRow] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!openMenuRow) {
      return;
    }

    const handleDocumentPointerDown = (event: MouseEvent) => {
      const targetElement = event.target as HTMLElement | null;
      if (!targetElement) {
        return;
      }
      if (targetElement.closest('[data-details-trigger="true"]')) {
        return;
      }
      if (menuRef.current?.contains(targetElement)) {
        return;
      }
      setOpenMenuRow(null);
      setMenuPosition(null);
    };

    document.addEventListener("mousedown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown);
    };
  }, [openMenuRow]);

  useEffect(() => {
    let cancelled = false;
    const loadChildren = async () => {
      try {
        const response = await fetch("/api/children", { cache: "no-store" });
        const data = (await response.json()) as { children?: HomeRow[] };
        if (!cancelled) {
          setChildrenRows(data.children ?? []);
        }
      } catch {
        if (!cancelled) {
          setChildrenRows([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingChildren(false);
        }
      }
    };
    loadChildren();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDeleteChild = async () => {
    if (!deleteTarget?.icdCode || isDeletingChild) {
      return;
    }
    setIsDeletingChild(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/children", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          icdCode: deleteTarget.icdCode,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "Failed to delete child.");
      }
      setChildrenRows((previous) =>
        previous.filter((row) => row.icdCode !== deleteTarget.icdCode),
      );
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete child.";
      setDeleteError(message);
    } finally {
      setIsDeletingChild(false);
    }
  };

  const filteredChildren = childrenRows.filter((child) =>
    child.clientName.toLowerCase().includes(searchQuery.toLowerCase().trim()),
  );

  return (
    <>
      <div
        className="entries-scroll absolute"
        style={{
          top: `${tableBodyTopPercent}%`,
          left: `${secondReferenceBoxLeftPercent}%`,
          width: `${secondReferenceBoxWidthPercent}%`,
          height: `${visibleEntryRows * entryRowHeightPx}px`,
          overflowY: "overlay",
          overflowX: "visible",
          borderLeft: "1.21px solid #E5E8EB",
          borderRight: "1.21px solid #E5E8EB",
          borderBottom: "1.21px solid #E5E8EB",
          borderBottomLeftRadius: "16px",
          borderBottomRightRadius: "16px",
        }}
      >
        {isLoadingChildren ? (
          <div
            className={`${manrope.className} flex h-full items-center justify-center text-center`}
            style={{
              color: "#121712",
              fontWeight: 400,
              fontSize: "14px",
              lineHeight: "25.32px",
              letterSpacing: "0px",
            }}
          >
            Loading...
          </div>
        ) : filteredChildren.length === 0 ? (
          <div
            className={`${manrope.className} flex h-full items-center justify-center text-center`}
            style={{
              color: "#121712",
              fontWeight: 400,
              fontSize: "14px",
              lineHeight: "25.32px",
              letterSpacing: "0px",
            }}
          >
            {searchQuery.trim()
              ? "No children found matching your search."
              : "No clients yet. Please add a child to continue."}
          </div>
        ) : (
          filteredChildren.map((entry) => {
            const rowKey = entry.icdCode || entry.clientName;
            return (
            <div
              key={rowKey}
              className={`${manrope.className} grid items-center`}
              style={{
                height: `${entryRowHeightPx}px`,
                gridTemplateColumns: "216fr 85fr 435fr 216fr 219fr 107fr",
                backgroundColor: "#FFFFFF",
                borderBottom: "1.21px solid #E5E8EB",
                color: "#121712",
                fontWeight: 400,
                fontSize: "14px",
                lineHeight: "25.32px",
                letterSpacing: "0px",
              }}
            >
              <span style={{ paddingLeft: rowTextLeftOffset }}>{entry.clientName}</span>
              <span style={{ paddingLeft: rowTextLeftOffset, color: "#616E8A" }}>{entry.age}</span>
              <span style={{ paddingLeft: rowTextLeftOffset, color: "#616E8A" }}>
                {entry.diagnosis}
              </span>
              <span style={{ paddingLeft: rowTextLeftOffset, color: "#616E8A" }}>
                {entry.therapist}
              </span>
              <span
                style={{
                  paddingLeft: rowTextLeftOffset,
                  color: entry.status === "New" ? "#15803D" : undefined,
                  fontWeight: entry.status === "New" ? 700 : 400,
                }}
              >
                {entry.status}
              </span>
              <div
                style={{
                  position: "relative",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!entry.icdCode) {
                      return;
                    }
                    router.push(`/child-profile/${encodeURIComponent(entry.icdCode)}`);
                  }}
                  onKeyDown={(event) => {
                    if (!entry.icdCode) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/child-profile/${encodeURIComponent(entry.icdCode)}`);
                    }
                  }}
                  style={{
                    paddingLeft: rowTextLeftOffset,
                    color: "#0A52C7",
                    fontWeight: 700,
                    fontSize: "14px",
                    lineHeight: "25.32px",
                    letterSpacing: "0px",
                    cursor: entry.icdCode ? "pointer" : "default",
                  }}
                >
                  {entry.details}
                </span>
                <button
                  type="button"
                  data-details-trigger="true"
                  onClick={(event) => {
                    if (openMenuRow === rowKey) {
                      setOpenMenuRow(null);
                      setMenuPosition(null);
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    setOpenMenuRow(rowKey);
                    setMenuPosition({
                      top: rect.bottom + 6,
                      left: rect.left,
                    });
                  }}
                  style={{
                    position: "absolute",
                    right: "0.5458333333333334vw",
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "9999px",
                      backgroundColor: "rgba(107, 117, 130, 0.30)",
                    }}
                  />
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "9999px",
                      backgroundColor: "rgba(107, 117, 130, 0.30)",
                    }}
                  />
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "9999px",
                      backgroundColor: "rgba(107, 117, 130, 0.30)",
                    }}
                  />
                </button>
              </div>
            </div>
          )})
        )}
      </div>
      {openMenuRow && menuPosition ? (
        <div
          ref={menuRef}
          className={inter.className}
          style={{
            position: "fixed",
            left: `${menuPosition.left}px`,
            top: `${menuPosition.top}px`,
            width: `${menuWidthVw}vw`,
            height: `${menuHeightVh}vh`,
            backgroundColor: "#FFFFFF",
            border: "1.21px solid #E5E8EB",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            zIndex: 999,
            borderRadius: "6px",
            boxShadow: "0 4px 14px rgba(18, 23, 39, 0.08)",
          }}
        >
                    <button
            type="button"
            onClick={() => {
              const editTarget =
                childrenRows.find((row) => (row.icdCode || row.clientName) === openMenuRow) ||
                null;
              setOpenMenuRow(null);
              setMenuPosition(null);
              if (editTarget?.icdCode) {
                router.push(`/edit-child?icd=${encodeURIComponent(editTarget.icdCode)}`);
              }
            }}
            className="details-menu-action"
            style={{
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontWeight: 400,
              fontSize: "14px",
              lineHeight: "100%",
              letterSpacing: "0px",
              color: "#121712",
            }}
          >
            Edit
          </button>
                    <button
            type="button"
            onClick={() => {
              const nextDeleteTarget =
                childrenRows.find((row) => (row.icdCode || row.clientName) === openMenuRow) ||
                null;
              setOpenMenuRow(null);
              setMenuPosition(null);
              setDeleteError(null);
              setDeleteTarget(nextDeleteTarget);
            }}
            className="details-menu-action"
            style={{
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontWeight: 400,
              fontSize: "14px",
              lineHeight: "100%",
              letterSpacing: "0px",
              color: "#121712",
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-[#12171233]"
          style={{ backdropFilter: "blur(2px)" }}
          onClick={() => {
            if (isDeletingChild) {
              return;
            }
            setDeleteError(null);
            setDeleteTarget(null);
          }}
        >
          <div
            className={`${manrope.className} bg-white`}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "relative",
              top: "-4%",
              width: "36.11111111111111vw",
              border: "1.21px solid #E5E8EB",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "0 14px 34px rgba(18, 23, 39, 0.12)",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#121712",
                fontWeight: 700,
                fontSize: "18px",
                lineHeight: "24px",
                letterSpacing: "0px",
              }}
            >
              Delete child profile?
            </p>
            <p
              style={{
                margin: "12px 0 0",
                color: "#616E8A",
                fontWeight: 400,
                fontSize: "14px",
                lineHeight: "22px",
                letterSpacing: "0px",
              }}
            >
              Are you sure you want to delete <strong>{deleteTarget.clientName}</strong>? This will
              remove all detections and this action cannot be undone.
            </p>
            {deleteError ? (
              <p
                style={{
                  margin: "12px 0 0",
                  color: "#DC2626",
                  fontWeight: 500,
                  fontSize: "13px",
                  lineHeight: "18px",
                  letterSpacing: "0px",
                }}
              >
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isDeletingChild) {
                    return;
                  }
                  setDeleteError(null);
                  setDeleteTarget(null);
                }}
                style={{
                  height: "40px",
                  padding: "0 16px",
                  borderRadius: "8px",
                  border: "1.21px solid #E5E8EB",
                  background: "#FFFFFF",
                  color: "#121712",
                  cursor: isDeletingChild ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: "14px",
                  lineHeight: "21px",
                  letterSpacing: "0px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteChild}
                disabled={isDeletingChild}
                style={{
                  height: "40px",
                  padding: "0 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#DC2626",
                  color: "#FFFFFF",
                  cursor: isDeletingChild ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: "14px",
                  lineHeight: "21px",
                  letterSpacing: "0px",
                  opacity: isDeletingChild ? 0.8 : 1,
                }}
              >
                {isDeletingChild ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className="absolute flex items-center justify-between"
        style={{
          top: `${searchBoxTopPercent}%`,
          left: `${searchBoxLeftPercent}%`,
          width: `${searchBoxWidthPercent}%`,
          height: `${searchBoxHeightPercent}%`,
          paddingLeft: "16px",
          paddingRight: "16px",
          gap: "12px",
          borderBottom: "1px solid #E5E8EB",
          background: "transparent",
        }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search children..."
          autoComplete="off"
          className="search-children-input"
          style={{
            fontFamily: '"SF Pro Display"',
            color: searchQuery ? "#121712" : "#94A3B8",
            fontWeight: 400,
            fontSize: "16px",
            lineHeight: "140%",
            letterSpacing: "0.2px",
            verticalAlign: "middle",
            border: "none",
            outline: "none",
            background: "transparent",
            width: "100%",
            flex: 1,
          }}
        />
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ opacity: 1, transform: "rotate(0deg)", flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="6.5" stroke="#94A3B8" strokeWidth="1.5" />
          <path d="M16 16L20 20" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <style jsx>{`
        .search-children-input::placeholder {
          color: #94a3b8;
          opacity: 1;
        }
        .details-menu-action {
          background: transparent;
          width: 100%;
          height: 24px;
        }
        .details-menu-action:hover {
          background: #f3f4f6;
        }
      `}</style>
    </>
  );
}

