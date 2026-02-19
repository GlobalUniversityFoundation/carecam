"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Manrope } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

type ProfileMenuProps = {
  leftPercent: number;
  topPercent: number;
  diameterVh: number;
  logoutPath: string;
  logoutRedirect: string;
};

export default function ProfileMenu({
  leftPercent,
  topPercent,
  diameterVh,
  logoutPath,
  logoutRedirect,
}: ProfileMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [isOpen]);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await fetch(logoutPath, { method: "POST" });
    } finally {
      setIsOpen(false);
      router.push(logoutRedirect);
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="absolute z-30"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          width: `${diameterVh}vh`,
          height: `${diameterVh}vh`,
        }}
      >
        <Image
          src="/profile.png"
          alt="Profile"
          width={40}
          height={40}
          className="rounded-full object-cover"
          style={{
            width: `${diameterVh}vh`,
            height: `${diameterVh}vh`,
          }}
        />
      </button>
      {isOpen ? (
        <div
          className={manrope.className}
          style={{
            position: "absolute",
            right: 0,
            top: `calc(${diameterVh}vh + 6px)`,
            width: "6.180555555555555vw",
            height: "9.441170750654464vh",
            backgroundColor: "#FFFFFF",
            border: "1.21px solid #E5E8EB",
            borderRadius: "6px",
            boxShadow: "0 4px 14px rgba(18, 23, 39, 0.08)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <button
            type="button"
            className="profile-menu-action"
            style={{
              border: "none",
              width: "100%",
              height: "24px",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "14px",
              lineHeight: "100%",
              letterSpacing: "0px",
              color: "#121712",
            }}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="profile-menu-action"
            style={{
              border: "none",
              width: "100%",
              height: "24px",
              cursor: isLoggingOut ? "not-allowed" : "pointer",
              fontWeight: 500,
              fontSize: "14px",
              lineHeight: "100%",
              letterSpacing: "0px",
              color: "#121712",
            }}
          >
            {isLoggingOut ? "..." : "Logout"}
          </button>
        </div>
      ) : null}
      <style jsx>{`
        .profile-menu-action {
          background: transparent;
        }
        .profile-menu-action:hover {
          background: #f3f4f6;
        }
      `}</style>
    </div>
  );
}

