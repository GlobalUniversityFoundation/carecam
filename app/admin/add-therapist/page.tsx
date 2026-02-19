"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Manrope } from "next/font/google";
import ProfileMenu from "@/app/components/profile-menu";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default function AdminAddTherapistPage() {
  const [users, setUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedTherapist, setSelectedTherapist] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    let isCancelled = false;

    const loadUsers = async () => {
      try {
        const response = await fetch("/api/admin/users");
        const data = (await response.json()) as { users?: string[]; message?: string };
        if (!response.ok) {
          throw new Error(data.message || "Failed to load users.");
        }
        if (!isCancelled) {
          const nextUsers = data.users || [];
          setUsers(nextUsers);
          if (nextUsers.length > 0) {
            setSelectedUser(nextUsers[0]);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : "Failed to load users.";
          setFeedback({ kind: "error", text: message });
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingUsers(false);
        }
      }
    };

    loadUsers();
    return () => {
      isCancelled = true;
    };
  }, []);

  const canSubmit = useMemo(
    () => Boolean(selectedUser && selectedTherapist.trim()) && !isSubmitting,
    [selectedUser, selectedTherapist, isSubmitting],
  );

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/therapists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerEmail: selectedUser,
          therapistName: selectedTherapist,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "Failed to assign therapist.");
      }
      setFeedback({ kind: "success", text: data.message || "Therapist assigned successfully." });
      setSelectedTherapist("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign therapist.";
      setFeedback({ kind: "error", text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <div className="mb-6 flex items-center justify-between">
          <h1 className={`${manrope.className} text-[32px] font-bold text-[#121712]`}>
            Add Therapist
          </h1>
          <Link
            href="/admin/dashboard"
            className={`${manrope.className} rounded-md border border-[#D0D6DE] bg-white px-3 py-1.5 text-sm font-medium text-[#121417]`}
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="max-w-2xl rounded-[16px] border border-[#E5E8EB] bg-white p-6">
          <div className="mb-4">
            <label className={`${manrope.className} mb-2 block text-[14px] font-medium text-[#121712]`}>
              Select User
            </label>
            <select
              value={selectedUser}
              onChange={(event) => setSelectedUser(event.target.value)}
              disabled={isLoadingUsers || users.length === 0}
              className={`${manrope.className} h-11 w-full rounded-md border border-[#DBE0E5] bg-white px-3 text-[14px] text-[#121712] outline-none`}
            >
              {isLoadingUsers ? (
                <option value="">Loading users...</option>
              ) : users.length === 0 ? (
                <option value="">No users found</option>
              ) : (
                users.map((email) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="mb-5">
            <label className={`${manrope.className} mb-2 block text-[14px] font-medium text-[#121712]`}>
              Therapist Name
            </label>
            <input
              type="text"
              value={selectedTherapist}
              onChange={(event) => setSelectedTherapist(event.target.value)}
              placeholder="Enter therapist name"
              className={`${manrope.className} h-11 w-full rounded-md border border-[#DBE0E5] bg-white px-3 text-[14px] text-[#121712] outline-none placeholder:text-[#8A94A6]`}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`${manrope.className} h-11 rounded-md px-4 text-[14px] font-bold text-white`}
            style={{
              backgroundColor: canSubmit ? "#0A52C7" : "#7FA2DB",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {isSubmitting ? "Saving..." : "Save Therapist"}
          </button>

          {feedback ? (
            <p
              className={`${manrope.className} mt-4 text-[14px]`}
              style={{ color: feedback.kind === "success" ? "#1F9D55" : "#DC2626" }}
            >
              {feedback.text}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

