"use client";

import { Manrope } from "next/font/google";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileMenu from "@/app/components/profile-menu";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default function AddChildPage() {
  const router = useRouter();
  const [childName, setChildName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [parentContact, setParentContact] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [therapistId, setTherapistId] = useState("");
  const [icdCode, setIcdCode] = useState("");
  const [insurance, setInsurance] = useState("");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [therapists, setTherapists] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingTherapists, setIsLoadingTherapists] = useState(true);
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const todayIsoDate = new Date().toISOString().split("T")[0];
  const markerBottomPercent = 93.97076465099747;
  const careCamLeftPercent = 5.555555555555555;
  const topBoxCenterFromTopPercent = (100 - markerBottomPercent) / 2;
  const profileLeftPercent = 91.66666666666666;
  const profileTopPercent = 0.7108903856511317;
  const profileDiameterVh = 4.607454577700267;
  const addChildrenLeftPercent = 7.083333333333333;
  const addChildrenTopPercent = 13.472475229928467;
  const childrenNameLeftPercent = 35.69444444444444;
  const childrenNameTopPercent = 22.25418758608433;
  const childrenNameInputTopPercent = 25.495401430666015;
  const childrenNameInputLeftPercent = 35.69444444444444;
  const childrenNameInputWidthPercent = 28.47222222222222;
  const childrenNameInputHeightPercent = 5.61603056826765;
  const assignedTherapistLeftPercent = 65.83333333333333;
  const dateOfBirthTopPercent = 33.47291953614431;
  const dateOfBirthInputTopPercent = 36.714133380725996;
  const diagnosisTopPercent = 44.69165148620429;
  const diagnosisInputTopPercent = 47.93286533078598;
  const parentGuardianTopPercent = 55.91038343626427;
  const parentGuardianInputTopPercent = 59.151597280845954;
  const intakeNotesTopPercent = parentGuardianTopPercent;
  const intakeNotesInputTopPercent = parentGuardianInputTopPercent;
  const intakeNotesInputHeightPercent = 16.248278313413605;
  const intakeNotesToCancelGapPercent = 2.3867673179396092;
  const cancelButtonHeightPercent = 4.884547069271758;
  const cancelButtonTopPercent =
    intakeNotesInputTopPercent + intakeNotesInputHeightPercent + intakeNotesToCancelGapPercent;
  const cancelButtonWidthPercent = 13.819444444444445;
  const cancelSaveGapPercent = 0.8333333333333334;
  const saveButtonLeftPercent =
    assignedTherapistLeftPercent + cancelButtonWidthPercent + cancelSaveGapPercent;
  const commonInputPaddingTopPx = 14.14;
  const commonInputPaddingLeftPx = 14.36;

  useEffect(() => {
    let isCancelled = false;

    const loadTherapists = async () => {
      try {
        const response = await fetch("/api/therapists");
        if (!response.ok) {
          throw new Error("Failed to load therapists.");
        }
        const data = (await response.json()) as {
          therapists?: Array<{ id: string; name: string }>;
        };
        if (!isCancelled) {
          setTherapists(data.therapists ?? []);
        }
      } catch {
        if (!isCancelled) {
          setTherapists([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTherapists(false);
        }
      }
    };

    loadTherapists();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    router.prefetch("/home");
  }, [router]);

  const showTimedFeedback = (nextFeedback: { kind: "success" | "error"; text: string }) => {
    setFeedback(nextFeedback);
    setTimeout(() => {
      setFeedback((current) =>
        current?.kind === nextFeedback.kind && current?.text === nextFeedback.text
          ? null
          : current,
      );
    }, 3000);
  };

  const handleCancel = () => {
    router.push("/home");
  };

  const handleSave = async () => {
    if (isSubmittingChild) {
      return;
    }

    const missingFields: string[] = [];
    if (!childName.trim()) missingFields.push("Children Name");
    if (!dateOfBirth.trim()) missingFields.push("Date of Birth");
    if (!parentContact.trim()) missingFields.push("Parent/Guardian Contact");
    if (!therapistId.trim()) missingFields.push("Assigned Therapist");
    if (!icdCode.trim()) missingFields.push("ICD Code");

    if (missingFields.length > 0) {
      showTimedFeedback({
        kind: "error",
        text: `Missing required fields: ${missingFields.join(", ")}`,
      });
      return;
    }

    setIsSubmittingChild(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/children", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childName,
          dateOfBirth,
          diagnosis,
          assignedTherapistId: therapistId,
          icdCode,
          insurance,
          countryCode,
          parentContact,
          intakeNotes,
        }),
      });
      const data = (await response.json()) as { message?: string; code?: string };
      if (response.ok) {
        router.push("/home");
        return;
      }
      if (response.status === 409 || data.code === "ICD_EXISTS") {
        showTimedFeedback({ kind: "error", text: "ICD code exists." });
        return;
      }
      showTimedFeedback({
        kind: "error",
        text: data.message || "Unable to save child profile.",
      });
    } catch {
      showTimedFeedback({
        kind: "error",
        text: "Unable to save child profile.",
      });
    } finally {
      setIsSubmittingChild(false);
    }
  };

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
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          top: `${addChildrenTopPercent}%`,
          left: `${addChildrenLeftPercent}%`,
          color: "#121712",
          fontWeight: 700,
          fontSize: "32px",
          lineHeight: "48.23px",
          letterSpacing: "0px",
        }}
      >
        Add Children
      </p>
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${childrenNameLeftPercent}%`,
          top: `${childrenNameTopPercent}%`,
          color: "#121712",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
        }}
      >
        Children Name
      </p>
      <input
        type="text"
        placeholder="Enter child name"
        maxLength={30}
        value={childName}
        onChange={(event) => setChildName(event.target.value)}
        autoComplete="off"
        className={`${manrope.className} add-child-input absolute`}
        style={{
          top: `${childrenNameInputTopPercent}%`,
          left: `${childrenNameInputLeftPercent}%`,
          width: `${childrenNameInputWidthPercent}%`,
          height: `${childrenNameInputHeightPercent}%`,
          border: "0.9px solid #DBE0E5",
          borderRadius: "7.18px",
          boxSizing: "border-box",
          paddingTop: `${commonInputPaddingTopPx}px`,
          paddingBottom: `${commonInputPaddingTopPx}px`,
          paddingLeft: `${commonInputPaddingLeftPx}px`,
          paddingRight: `${commonInputPaddingLeftPx}px`,
          color: "#000000",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          outline: "none",
        }}
      />
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${assignedTherapistLeftPercent}%`,
          top: `${childrenNameTopPercent}%`,
          color: "#121712",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
        }}
      >
        Assigned Therapist
      </p>
      <div
        className="absolute"
        style={{
          top: `${childrenNameInputTopPercent}%`,
          left: `${assignedTherapistLeftPercent}%`,
          width: `${childrenNameInputWidthPercent}%`,
          height: `${childrenNameInputHeightPercent}%`,
        }}
      >
        <select
          value={therapistId}
          onChange={(event) => setTherapistId(event.target.value)}
          required
          className={`${manrope.className} add-child-select h-full w-full appearance-none rounded-[7.18px] border-[0.9px] border-[#DBE0E5] bg-white`}
          style={{
            boxSizing: "border-box",
            paddingTop: "0px",
            paddingBottom: "0px",
            paddingLeft: `${commonInputPaddingLeftPx}px`,
            paddingRight: "36px",
            color: "#637387",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: "21.54px",
            letterSpacing: "0px",
            outline: "none",
          }}
        >
          <option value="" disabled hidden>
            Select a therapist
          </option>
          {isLoadingTherapists ? (
            <option value="" disabled>
              Loading therapists...
            </option>
          ) : therapists.length === 0 ? (
            <option value="" disabled>
              No therapists found
            </option>
          ) : (
            therapists.map((therapist) => (
              <option key={therapist.id} value={therapist.id}>
                {therapist.name}
              </option>
            ))
          )}
        </select>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[14px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-[2px]"
        >
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 5L5 1L9 5" stroke="#637387" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L5 5L9 1" stroke="#637387" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${assignedTherapistLeftPercent}%`,
          top: `${dateOfBirthTopPercent}%`,
          color: "#121712",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
        }}
      >
        ICD Code
      </p>
      <input
        type="text"
        placeholder="Enter ICD code"
        value={icdCode}
        onChange={(event) => setIcdCode(event.target.value)}
        autoComplete="off"
        className={`${manrope.className} add-child-input absolute`}
        style={{
          top: `${dateOfBirthInputTopPercent}%`,
          left: `${assignedTherapistLeftPercent}%`,
          width: `${childrenNameInputWidthPercent}%`,
          height: `${childrenNameInputHeightPercent}%`,
          border: "0.9px solid #DBE0E5",
          borderRadius: "7.18px",
          boxSizing: "border-box",
          paddingTop: `${commonInputPaddingTopPx}px`,
          paddingBottom: `${commonInputPaddingTopPx}px`,
          paddingLeft: `${commonInputPaddingLeftPx}px`,
          paddingRight: `${commonInputPaddingLeftPx}px`,
          color: "#000000",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          outline: "none",
        }}
      />
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${assignedTherapistLeftPercent}%`,
          top: `${diagnosisTopPercent}%`,
          color: "#121712",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
        }}
      >
        Insurance
      </p>
      <input
        type="text"
        placeholder="Enter insurance number"
        value={insurance}
        onChange={(event) => setInsurance(event.target.value)}
        autoComplete="off"
        className={`${manrope.className} add-child-input absolute`}
        style={{
          top: `${diagnosisInputTopPercent}%`,
          left: `${assignedTherapistLeftPercent}%`,
          width: `${childrenNameInputWidthPercent}%`,
          height: `${childrenNameInputHeightPercent}%`,
          border: "0.9px solid #DBE0E5",
          borderRadius: "7.18px",
          boxSizing: "border-box",
          paddingTop: `${commonInputPaddingTopPx}px`,
          paddingBottom: `${commonInputPaddingTopPx}px`,
          paddingLeft: `${commonInputPaddingLeftPx}px`,
          paddingRight: `${commonInputPaddingLeftPx}px`,
          color: "#000000",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          outline: "none",
        }}
      />
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${childrenNameLeftPercent}%`,
          top: `${dateOfBirthTopPercent}%`,
          color: "#121712",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
        }}
      >
        Date of Birth
      </p>
      <input
        type="date"
        max={todayIsoDate}
        placeholder="DD/MM/YYYY"
        required
        value={dateOfBirth}
        onChange={(event) => setDateOfBirth(event.target.value)}
        autoComplete="off"
        className={`${manrope.className} add-child-input add-child-date-input absolute`}
        style={{
          top: `${dateOfBirthInputTopPercent}%`,
          left: `${childrenNameInputLeftPercent}%`,
          width: `${childrenNameInputWidthPercent}%`,
          height: `${childrenNameInputHeightPercent}%`,
          border: "0.9px solid #DBE0E5",
          borderRadius: "7.18px",
          boxSizing: "border-box",
          paddingTop: `${commonInputPaddingTopPx}px`,
          paddingBottom: `${commonInputPaddingTopPx}px`,
          paddingLeft: `${commonInputPaddingLeftPx}px`,
          paddingRight: `${commonInputPaddingLeftPx}px`,
          color: "#637387",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          outline: "none",
        }}
      />
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${childrenNameLeftPercent}%`,
          top: `${diagnosisTopPercent}%`,
          color: "#121712",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
        }}
      >
        Diagnosis (if applicable)
      </p>
      <input
        type="text"
        placeholder="Enter diagnosis"
        maxLength={40}
        value={diagnosis}
        onChange={(event) => setDiagnosis(event.target.value)}
        autoComplete="off"
        className={`${manrope.className} add-child-input absolute`}
        style={{
          top: `${diagnosisInputTopPercent}%`,
          left: `${childrenNameInputLeftPercent}%`,
          width: `${childrenNameInputWidthPercent}%`,
          height: `${childrenNameInputHeightPercent}%`,
          border: "0.9px solid #DBE0E5",
          borderRadius: "7.18px",
          boxSizing: "border-box",
          paddingTop: `${commonInputPaddingTopPx}px`,
          paddingBottom: `${commonInputPaddingTopPx}px`,
          paddingLeft: `${commonInputPaddingLeftPx}px`,
          paddingRight: `${commonInputPaddingLeftPx}px`,
          color: "#000000",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          outline: "none",
        }}
      />
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${childrenNameLeftPercent}%`,
          top: `${parentGuardianTopPercent}%`,
          color: "#121712",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
        }}
      >
        Parent/Guardian Contact
      </p>
      <div
        className="absolute flex items-center gap-[8px]"
        style={{
          top: `${parentGuardianInputTopPercent}%`,
          left: `${childrenNameInputLeftPercent}%`,
          width: `${childrenNameInputWidthPercent}%`,
          height: `${childrenNameInputHeightPercent}%`,
        }}
      >
        <select
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
          className={`${manrope.className} add-child-select h-full rounded-[7.18px] border-[0.9px] border-[#DBE0E5] bg-white`}
          style={{
            width: "34%",
            boxSizing: "border-box",
            paddingLeft: `${commonInputPaddingLeftPx}px`,
            paddingRight: `${commonInputPaddingLeftPx}px`,
            color: "#121712",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: "21.54px",
            letterSpacing: "0px",
            outline: "none",
          }}
        >
          <option value="+91">+91 (India)</option>
          <option value="+1">+1 (US/CA)</option>
          <option value="+44">+44 (UK)</option>
          <option value="+61">+61 (Australia)</option>
        </select>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Enter contact information"
          value={parentContact}
          onChange={(event) => setParentContact(event.target.value.replace(/\D/g, ""))}
          autoComplete="off"
          className={`${manrope.className} add-child-input h-full flex-1`}
          style={{
            border: "0.9px solid #DBE0E5",
            borderRadius: "7.18px",
            boxSizing: "border-box",
            paddingTop: `${commonInputPaddingTopPx}px`,
            paddingBottom: `${commonInputPaddingTopPx}px`,
            paddingLeft: `${commonInputPaddingLeftPx}px`,
            paddingRight: `${commonInputPaddingLeftPx}px`,
            color: "#000000",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: "21.54px",
            letterSpacing: "0px",
            outline: "none",
          }}
        />
      </div>
      <p
        className={`${manrope.className} absolute m-0`}
        style={{
          left: `${assignedTherapistLeftPercent}%`,
          top: `${intakeNotesTopPercent}%`,
          color: "#121712",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
        }}
      >
        Intake Notes (Optional)
      </p>
      <textarea
        autoComplete="off"
        value={intakeNotes}
        onChange={(event) => setIntakeNotes(event.target.value)}
        className={`${manrope.className} add-child-input absolute resize-none`}
        style={{
          top: `${intakeNotesInputTopPercent}%`,
          left: `${assignedTherapistLeftPercent}%`,
          width: `${childrenNameInputWidthPercent}%`,
          height: `${intakeNotesInputHeightPercent}%`,
          border: "0.9px solid #DBE0E5",
          borderRadius: "7.18px",
          boxSizing: "border-box",
          paddingTop: `${commonInputPaddingTopPx}px`,
          paddingBottom: `${commonInputPaddingTopPx}px`,
          paddingLeft: `${commonInputPaddingLeftPx}px`,
          paddingRight: `${commonInputPaddingLeftPx}px`,
          color: "#000000",
          fontWeight: 400,
          fontSize: "14px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          outline: "none",
        }}
      />
      <button
        type="button"
        onClick={handleCancel}
        className={`${manrope.className} absolute bg-white`}
        style={{
          top: `${cancelButtonTopPercent}%`,
          left: `${assignedTherapistLeftPercent}%`,
          width: `${cancelButtonWidthPercent}%`,
          height: `${cancelButtonHeightPercent}%`,
          border: "1px solid #0A52C7",
          borderRadius: "7.18px",
          color: "#0A52C7",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "14.36px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          textAlign: "center",
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSubmittingChild}
        className={`${manrope.className} absolute bg-[#0A52C7] text-white`}
        style={{
          top: `${cancelButtonTopPercent}%`,
          left: `${saveButtonLeftPercent}%`,
          width: `${cancelButtonWidthPercent}%`,
          height: `${cancelButtonHeightPercent}%`,
          border: "1px solid #0A52C7",
          borderRadius: "7.18px",
          color: "#FFFFFF",
          opacity: isSubmittingChild ? 0.8 : 1,
          cursor: isSubmittingChild ? "not-allowed" : "pointer",
          fontWeight: 700,
          fontSize: "14.36px",
          lineHeight: "21.54px",
          letterSpacing: "0px",
          textAlign: "center",
        }}
      >
        {isSubmittingChild ? "Saving..." : "Save"}
      </button>
      {feedback ? (
        <p
          className={`${manrope.className} absolute m-0`}
          style={{
            top: `${cancelButtonTopPercent + cancelButtonHeightPercent + 1.2}%`,
            left: `${assignedTherapistLeftPercent}%`,
            color: feedback.kind === "success" ? "#1F9D55" : "#DC2626",
            fontWeight: 500,
            fontSize: "13px",
            lineHeight: "18px",
            letterSpacing: "0px",
          }}
        >
          {feedback.text}
        </p>
      ) : null}
    </main>
  );
}

