"use client";

import Image from "next/image";
import { Manrope } from "next/font/google";
import { useState } from "react";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const leftPanelWidthPercent = (731.26 / 1440) * 100;
  const imageHorizontalFocusPercent = 10;
  const careCamTopPercent = 5.352779135380104;
  const careCamLeftPercent = 5.517361111111111;
  const subtitleTopPercent = 11.12875994135158;
  const referenceBoxTopPercent = 22.659617008041943;
  const referenceBoxLeftPercent = 56.80555555555556;
  const referenceBoxWidthPercent = 37.638888888888886;
  const referenceBoxHeightPercent = 52.12689429821744;
  const referenceDividerTopInBoxPercent = 12.876953914540348;
  const footerBottomPercent = 3.105700448749278;
  const footerRightPercent = 5.555555555555555;

  const handleAdminLogin = async () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { message?: string };
      if (response.ok) {
        window.location.href = "/admin/dashboard";
        return;
      }
      setFeedback(data.message || "Invalid admin credentials.");
    } catch {
      setFeedback("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex h-screen w-screen overflow-hidden bg-white">
      <h1
        className={`${manrope.className} absolute z-10 m-0 text-[32px] font-bold text-black`}
        style={{
          top: `${careCamTopPercent}%`,
          left: `${careCamLeftPercent}%`,
          lineHeight: "100%",
          letterSpacing: "0px",
        }}
      >
        CareCam
      </h1>
      <p
        className={`${manrope.className} absolute z-10 m-0 text-[18px] font-normal text-black`}
        style={{
          top: `${subtitleTopPercent}%`,
          left: `${careCamLeftPercent}%`,
          lineHeight: "140%",
          letterSpacing: "0px",
        }}
      >
        Therapy Monitoring & Goal
        <br />
        Optimization Platform
      </p>

      <div
        className="absolute z-10 rounded-md"
        style={{
          top: `${referenceBoxTopPercent}%`,
          left: `${referenceBoxLeftPercent}%`,
          width: `${referenceBoxWidthPercent}%`,
          height: `${referenceBoxHeightPercent}%`,
        }}
      >
        <div
          className="absolute left-0 top-0 flex w-full items-center justify-center"
          style={{ height: `${referenceDividerTopInBoxPercent}%` }}
        >
          <p
            className={`${manrope.className} m-0 text-center text-[32px] font-bold`}
            style={{
              color: "#121417",
              lineHeight: "31.42px",
              letterSpacing: "0px",
            }}
          >
            Admin Sign-in
          </p>
        </div>
        <div
          className="absolute left-0 right-0 bottom-0 flex justify-center"
          style={{ top: `${referenceDividerTopInBoxPercent}%` }}
        >
          <form autoComplete="off" className="flex w-[84%] flex-col justify-center gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="admin-email"
                className={`${manrope.className} text-black`}
                style={{
                  fontWeight: 500,
                  fontSize: "14px",
                  lineHeight: "21.54px",
                  letterSpacing: "0px",
                }}
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="off"
                placeholder="Enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`${manrope.className} h-11 rounded-md border border-[#D0D6DE] px-3 text-black outline-none placeholder:text-[#8A94A6]`}
                style={{
                  fontWeight: 400,
                  fontSize: "14px",
                  lineHeight: "21.54px",
                  letterSpacing: "0px",
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="admin-password"
                className={`${manrope.className} text-black`}
                style={{
                  fontWeight: 500,
                  fontSize: "14px",
                  lineHeight: "21.54px",
                  letterSpacing: "0px",
                }}
              >
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${manrope.className} h-11 rounded-md border border-[#D0D6DE] px-3 text-black outline-none placeholder:text-[#8A94A6]`}
                style={{
                  fontWeight: 400,
                  fontSize: "14px",
                  lineHeight: "21.54px",
                  letterSpacing: "0px",
                }}
              />
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleAdminLogin}
              className={`${manrope.className} h-10 rounded-md text-white`}
              style={{
                backgroundColor: isSubmitting ? "#7FA2DB" : "#0A52C7",
                opacity: isSubmitting ? 0.8 : 1,
                filter: isSubmitting ? "blur(0.2px)" : "none",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: "14.36px",
                lineHeight: "21.54px",
                letterSpacing: "0px",
                textAlign: "center",
              }}
            >
              {isSubmitting ? "Signing In..." : "Login"}
            </button>
            {feedback ? (
              <p
                className={`${manrope.className} m-0 text-center text-[#DC2626]`}
                style={{
                  fontWeight: 500,
                  fontSize: "13px",
                  lineHeight: "18px",
                  letterSpacing: "0px",
                }}
              >
                {feedback}
              </p>
            ) : null}
          </form>
        </div>
      </div>

      <section
        className="relative h-full overflow-hidden rounded-br-[40px] rounded-tr-[40px]"
        style={{ width: `${leftPanelWidthPercent}%` }}
      >
        <Image
          src="/login.png"
          alt="Login"
          fill
          priority
          className="object-cover"
          style={{ objectPosition: `${imageHorizontalFocusPercent}% center` }}
          sizes={`${leftPanelWidthPercent}vw`}
        />
      </section>
      <section className="h-full flex-1 bg-white" />
      <p
        className={`${manrope.className} absolute z-10 m-0 text-right`}
        style={{
          color: "#637387",
          right: `${footerRightPercent}%`,
          bottom: `${footerBottomPercent}%`,
          fontWeight: 400,
          fontSize: "12px",
          lineHeight: "25.32px",
          letterSpacing: "0px",
        }}
      >
        Powered by{" "}
        <span
          style={{
            fontWeight: 700,
            fontSize: "12px",
            lineHeight: "25.32px",
            letterSpacing: "0px",
          }}
        >
          Global HealthX
        </span>
      </p>
    </main>
  );
}

