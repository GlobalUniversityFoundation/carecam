"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Manrope } from "next/font/google";
import Image from "next/image";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

type UploadVideoModalTriggerProps = {
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  icdCode: string;
  onUploadComplete?: () => void;
};

type UploadItem = {
  id: string;
  fileName: string;
  sizeText: string;
  progress: number;
  uiStatus: "uploading" | "completed" | "error";
  errorMessage?: string;
};

export default function UploadVideoModalTrigger({
  topPercent,
  leftPercent,
  widthPercent,
  heightPercent,
  icdCode,
  onUploadComplete,
}: UploadVideoModalTriggerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [isOpen]);

  const isSupportedFile = (file: File) => {
    const ext = file.name.toLowerCase().split(".").pop() || "";
    const supportedExt = ext === "mp4" || ext === "avi";
    return supportedExt;
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const bytesToHex = (buffer: ArrayBuffer) =>
    Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

  const getFrameHash = async (videoEl: HTMLVideoElement, captureTime: number) => {
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Unable to read video frame."));
      };
      const cleanup = () => {
        videoEl.removeEventListener("seeked", onSeeked);
        videoEl.removeEventListener("error", onError);
      };
      videoEl.addEventListener("seeked", onSeeked, { once: true });
      videoEl.addEventListener("error", onError, { once: true });
      videoEl.currentTime = Math.max(0, Math.min(captureTime, Math.max(videoEl.duration - 0.001, 0)));
    });

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to prepare frame hash.");
    }
    context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const digest = await crypto.subtle.digest("SHA-256", imageData.data);
    return bytesToHex(digest);
  };

  const extractVideoFingerprint = (file: File) =>
    new Promise<{
      durationSeconds: number;
      firstFrameHash: string;
      lastFrameHash: string;
    }>((resolve, reject) => {
      const videoEl = document.createElement("video");
      const objectUrl = URL.createObjectURL(file);
      videoEl.preload = "metadata";
      videoEl.src = objectUrl;
      videoEl.onloadedmetadata = async () => {
        try {
          if (!Number.isFinite(videoEl.duration) || videoEl.duration <= 0) {
            throw new Error("Unable to read video duration.");
          }
          const durationSeconds = Number(videoEl.duration.toFixed(3));
          const firstFrameHash = await getFrameHash(videoEl, 0);
          const lastFrameHash = await getFrameHash(videoEl, Math.max(videoEl.duration - 0.05, 0));
          URL.revokeObjectURL(objectUrl);
          resolve({ durationSeconds, firstFrameHash, lastFrameHash });
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      };
      videoEl.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to analyze this video."));
      };
    });

  const uploadFileWithProgress = (
    file: File,
    id: string,
    fingerprint: { durationSeconds: number; firstFrameHash: string; lastFrameHash: string },
  ) =>
    new Promise<{ uploadedAt?: string; status?: string }>((resolve, reject) => {
      void (async () => {
        const prepareRes = await fetch("/api/children/videos/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            icdCode,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            durationSeconds: fingerprint.durationSeconds,
            firstFrameHash: fingerprint.firstFrameHash,
            lastFrameHash: fingerprint.lastFrameHash,
          }),
        });
        const preparePayload = (await prepareRes.json().catch(() => ({}))) as {
          message?: string;
          uploadUrl?: string;
          uploadEpoch?: string;
          storagePath?: string;
          safeName?: string;
          mimeType?: string;
        };
        if (!prepareRes.ok || !preparePayload.uploadUrl || !preparePayload.uploadEpoch || !preparePayload.storagePath) {
          reject(new Error(preparePayload.message || "Failed to prepare upload."));
          return;
        }

        const xhr = new XMLHttpRequest();
        xhr.open("PUT", preparePayload.uploadUrl);
        xhr.setRequestHeader("Content-Type", preparePayload.mimeType || file.type || "application/octet-stream");
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            return;
          }
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploads((current) =>
            current.map((item) => (item.id === id ? { ...item, progress: percent } : item)),
          );
        };
        xhr.onload = () => {
          if (!(xhr.status >= 200 && xhr.status < 300)) {
            reject(new Error("Upload failed."));
            return;
          }
          void (async () => {
            const completeRes = await fetch("/api/children/videos/complete", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                icdCode,
                uploadEpoch: preparePayload.uploadEpoch,
                storagePath: preparePayload.storagePath,
                safeName: preparePayload.safeName || file.name,
                durationSeconds: fingerprint.durationSeconds,
                firstFrameHash: fingerprint.firstFrameHash,
                lastFrameHash: fingerprint.lastFrameHash,
                mimeType: preparePayload.mimeType || file.type || "application/octet-stream",
              }),
            });
            const completePayload = (await completeRes.json().catch(() => ({}))) as {
              message?: string;
              uploadedAt?: string;
              status?: string;
            };
            if (!completeRes.ok) {
              reject(new Error(completePayload.message || "Failed to finalize upload."));
              return;
            }
            resolve(completePayload);
          })().catch(() => reject(new Error("Failed to finalize upload.")));
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(file);
      })().catch((error: unknown) => {
        reject(error instanceof Error ? error : new Error("Upload failed."));
      });
    });

  const queueFiles = async (incomingFiles: File[]) => {
    const validFiles = incomingFiles.filter(isSupportedFile);
    if (validFiles.length === 0) {
      return;
    }

    validFiles.forEach((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploads((current) => [
        {
          id,
          fileName: file.name,
          sizeText: formatBytes(file.size),
          progress: 0,
          uiStatus: "uploading",
        },
        ...current,
      ]);

      void extractVideoFingerprint(file)
        .then((fingerprint) => uploadFileWithProgress(file, id, fingerprint))
        .then(() => {
          setUploads((current) =>
            current.map((item) =>
              item.id === id ? { ...item, progress: 100, uiStatus: "completed" } : item,
            ),
          );
          setTimeout(() => {
            setIsOpen(false);
            setIsDragging(false);
            setUploads([]);
            router.refresh();
            onUploadComplete?.();
          }, 3000);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Upload failed.";
          setUploads((current) =>
            current.map((item) =>
              item.id === id ? { ...item, uiStatus: "error", errorMessage: message } : item,
            ),
          );
          setTimeout(() => {
            setUploads((current) => current.filter((item) => item.id !== id));
          }, 3000);
        });
    });
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    void queueFiles(selected);
    event.target.value = "";
  };

  const onDropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const dropped = Array.from(event.dataTransfer.files || []);
    void queueFiles(dropped);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${manrope.className} absolute inline-flex items-center justify-center gap-[10px] rounded-[12px] bg-[#0A52C7] text-white`}
        style={{
          top: `${topPercent}%`,
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          height: `${heightPercent}%`,
          border: "none",
          fontWeight: 500,
          fontSize: "16px",
          lineHeight: "24px",
          letterSpacing: "0px",
          verticalAlign: "middle",
          cursor: "pointer",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M12 16V6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 10L12 6L16 10" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M4 16V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V16"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Upload Video
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[1400] flex items-center justify-center bg-[#12171266]"
          onClick={() => setIsOpen(false)}
        >
          <div
            className={`${manrope.className} fixed rounded-[16px]`}
            onClick={(event) => event.stopPropagation()}
            style={{
              top: "17.60519038387701%",
              bottom: "17.60519038387701%",
              left: "29.0625%",
              right: "29.0625%",
              backgroundColor: "#F3F3F3",
              boxShadow: "0 20px 50px rgba(18, 23, 39, 0.18)",
            }}
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close upload modal"
              style={{
                position: "absolute",
                top: "2.7773967911123304%",
                right: "2.406301824212272%",
                width: "2.3217247097844112%",
                height: "2.400905225620628%",
                minWidth: "2.3217247097844112%",
                minHeight: "2.400905225620628%",
                maxWidth: "2.3217247097844112%",
                maxHeight: "2.400905225620628%",
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 0,
                lineHeight: 0,
                overflow: "visible",
                cursor: "pointer",
                color: "#000000",
              }}
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
                style={{
                  width: "30px",
                  height: "30px",
                  display: "block",
                  flexShrink: 0,
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <path d="M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                <path d="M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
              </svg>
            </button>
            <p
              className="absolute m-0"
              style={{
                top: "6.528596900288029%",
                left: "4.72636815920398%",
                color: "#292D32",
                fontWeight: 500,
                fontSize: "21.75px",
                lineHeight: "21.75px",
                letterSpacing: "0px",
              }}
            >
              Upload files
            </p>
            <div
              className="absolute"
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={onDropFiles}
              style={{
                top: "14.058428199149636%",
                left: "4.668325041459366%",
                right: "4.728026533996682%",
                bottom: "38.95041832396105%",
                backgroundColor: "#FFFFFF",
                borderRadius: "16.63px",
                border: `1px dashed ${isDragging ? "#0A52C7" : "#D0D5DD"}`,
              }}
            />
            <Image
              src="/file-add.svg"
              alt="Add file"
              width={30}
              height={66}
              className="absolute object-contain"
              style={{
                top: "27.911123302701963%",
                bottom: "67.75476615004801%",
                left: "48.134328358208954%",
                right: "48.134328358208954%",
              }}
            />
            <p
              className={`${manrope.className} absolute m-0 text-center`}
              style={{
                top: "37.89089288163489%",
                left: "25.787728026533998%",
                color: "#292D32",
                fontWeight: 500,
                fontSize: "19.19px",
                lineHeight: "19.19px",
                letterSpacing: "0px",
                whiteSpace: "nowrap",
              }}
            >
              <button
                type="button"
                onClick={handleBrowseClick}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  margin: 0,
                  color: "#0A52C7",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "19.19px",
                  lineHeight: "19.19px",
                  letterSpacing: "0px",
                }}
              >
                Browse File
              </button>{" "}
              or drag &amp; drop it here
            </p>
            <p
              className={`${manrope.className} absolute m-0 text-center`}
              style={{
                top: "43.99430805102181%",
                left: "30.43117744610282%",
                color: "#A9ACB4",
                fontWeight: 500,
                fontSize: "16.63px",
                lineHeight: "16.63px",
                letterSpacing: "0px",
                whiteSpace: "nowrap",
              }}
            >
              MP4, AVI formats, up to 200MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.avi,video/mp4,video/x-msvideo,video/avi"
              multiple
              className="hidden"
              onChange={onFileInputChange}
            />
            <div
              className="absolute"
              style={{
                top: "64.5%",
                left: "4.7%",
                right: "4.7%",
                bottom: "5%",
                overflowY: "auto",
              }}
            >
              {uploads.map((item) => (
                <div
                  key={item.id}
                  className={`${manrope.className} mb-2 rounded-[10px] bg-white px-3 py-2`}
                  style={{ border: "1px solid #E5E8EB" }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <p
                      className="m-0"
                      style={{ color: "#121417", fontWeight: 600, fontSize: "13px", lineHeight: "16px" }}
                    >
                      {item.fileName}
                    </p>
                    <p
                      className="m-0"
                      style={{
                        color:
                          item.uiStatus === "completed"
                            ? "#16A34A"
                            : item.uiStatus === "error"
                              ? "#DC2626"
                              : "#64748B",
                        fontWeight: 500,
                        fontSize: "12px",
                        lineHeight: "14px",
                      }}
                    >
                      {item.uiStatus === "uploading"
                        ? `${item.progress}% Uploading`
                        : item.uiStatus === "completed"
                          ? "Completed"
                          : "Failed"}
                    </p>
                  </div>
                  <p
                    className="m-0 mb-1"
                    style={{ color: "#8A94A6", fontWeight: 500, fontSize: "11px", lineHeight: "13px" }}
                  >
                    {item.errorMessage ? item.errorMessage : item.sizeText}
                  </p>
                  <div className="h-[4px] rounded bg-[#E2E8F0]">
                    <div
                      className="h-[4px] rounded"
                      style={{
                        width: `${item.progress}%`,
                        backgroundColor: item.uiStatus === "error" ? "#DC2626" : "#3B82F6",
                        transition: "width 180ms linear",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

