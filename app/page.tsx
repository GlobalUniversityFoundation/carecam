"use client";

import Image from "next/image";
import { Manrope } from "next/font/google";
import { useState } from "react";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
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

  const handlePrimaryAction = async () => {
    if (isSubmittingAuth) {
      return;
    }

    setIsSubmittingAuth(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const responseData = (await response.json()) as { message?: string; code?: string };

      if (response.ok) {
        window.location.href = "/home";
        return;
      }

      if (response.status === 409 || responseData.code === "EMAIL_EXISTS") {
        showTimedFeedback({ kind: "error", text: "User with email already exists." });
        return;
      }

      showTimedFeedback({
        kind: "error",
        text: responseData.message || "Invalid email or password.",
      });
    } catch {
      showTimedFeedback({
        kind: "error",
        text: "Unable to sign in. Please try again.",
      });
    } finally {
      setIsSubmittingAuth(false);
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
            Sign-in
          </p>
        </div>
        <div
          className="absolute left-0 w-full"
          style={{ top: `${referenceDividerTopInBoxPercent}%` }}
        />
        <div
          className="absolute left-0 right-0 bottom-0 flex justify-center"
          style={{ top: `${referenceDividerTopInBoxPercent}%` }}
        >
          <form autoComplete="off" className="flex w-[84%] flex-col justify-center gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
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
                id="email"
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
                htmlFor="password"
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
                id="password"
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
              disabled={isSubmittingAuth}
              onClick={handlePrimaryAction}
              className={`${manrope.className} h-10 rounded-md text-white`}
              style={{
                backgroundColor: isSubmittingAuth ? "#7FA2DB" : "#0A52C7",
                opacity: isSubmittingAuth ? 0.8 : 1,
                filter: isSubmittingAuth ? "blur(0.2px)" : "none",
                cursor: isSubmittingAuth ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: "14.36px",
                lineHeight: "21.54px",
                letterSpacing: "0px",
                textAlign: "center",
              }}
            >
              {isSubmittingAuth
                ? "Signing In..."
                : "Login"}
            </button>
            {feedback ? (
              <p
                className={`${manrope.className} m-0 text-center`}
                style={{
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
