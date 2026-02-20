import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { GoogleGenAI, Type } from "@google/genai";

const CHUNK_SECONDS = 30;
const CHUNK_OVERLAP_SECONDS = 4;
const MAX_CLIP_FPS = 24;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const TEMPERATURE = 0.4;
const CONCURRENCY = 5;
const GLOBAL_RATE_LIMIT_PAUSE_MS = 5 * 60 * 1000;
const MAX_TRANSIENT_RETRIES = Number(process.env.GEMINI_MAX_RETRIES || 3);
const TRANSIENT_RETRY_INTERVAL_MS = Number(process.env.GEMINI_RETRY_INTERVAL_MS || 60_000);
const MERGE_GAP_SECONDS = 2.5;
const VALIDATION_MARGIN_SECONDS = 3;
const MIN_ACTION_DURATION_SECONDS = 0.8;
const GEMINI_CALL_TIMEOUT_MS = Number(process.env.GEMINI_CALL_TIMEOUT_MS || 120_000);
const FILE_READY_TIMEOUT_MS = Number(process.env.GEMINI_FILE_READY_TIMEOUT_MS || 300_000);

const VISUAL_BEHAVIORS = [
  "hitting the therapist with hand",
  "kicking the therapist with foot",
  "throwing objects",
  "non compliance",
  "pushing/shoving a person",
  "out of seat",
  "hand-flapping repeatedly",
  "body-rocking",
  "pulling or twirling hair",
];

const AUDIO_BEHAVIORS = ["crying", "screaming", "whimpering", "echolalia", "laughing"];
const BEHAVIORS = [...VISUAL_BEHAVIORS, ...AUDIO_BEHAVIORS];

const DETECTION_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      behavior: { type: Type.STRING, enum: BEHAVIORS },
      startSec: { type: Type.NUMBER },
      endSec: { type: Type.NUMBER },
      modality: { type: Type.STRING, enum: ["visual", "audio"] },
      notes: { type: Type.STRING },
    },
    required: ["behavior", "startSec", "endSec", "modality"],
  },
};

const VALIDATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    correct: { type: Type.BOOLEAN },
    startSec: { type: Type.NUMBER },
    endSec: { type: Type.NUMBER },
  },
  required: ["correct"],
};

const BEHAVIOR_DEFINITIONS = {
  "hitting the therapist with hand":
    "The child uses a hand or arm to strike a person with a clear impact motion.",
  "kicking the therapist with foot":
    "The child uses a foot or leg to strike a person with a clear impact motion.",
  "throwing objects":
    "The child propels an object through the air away from their body.",
  "non compliance":
    "The child refuses, ignores, or does not follow a therapist instruction.",
  "pushing/shoving a person":
    "The child uses hands or body force to move a person away.",
  "out of seat":
    "The child is not seated when expected to remain in their seat.",
  "hand-flapping repeatedly": "Rapid, repetitive flapping motions of the hands or arms.",
  "body-rocking": "Rhythmic back-and-forth or side-to-side movement of the torso or body.",
  "pulling or twirling hair":
    "The child pulls, tugs, twirls, or wraps their own hair using one hand or both hands, including brief repeated pulls.",
  crying: "Tearful vocalization indicating distress or sadness.",
  screaming: "Loud, high-pitched vocalization.",
  whimpering: "Soft, distressed, whining vocal sounds.",
  echolalia: "Repeating words or phrases said by others.",
  laughing: "Vocal sounds indicating laughter.",
};

class SkipUnitError extends Error {
  constructor(message) {
    super(message);
    this.name = "SkipUnitError";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  return Promise.race([
    promise,
    sleep(timeoutMs).then(() => {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }),
  ]);
}

function isRateLimitError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.status === 429 ||
    error?.code === 429 ||
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted")
  );
}

function isRetryableError(error) {
  if (isRateLimitError(error)) return true;
  const status = Number(error?.status || error?.code);
  if (Number.isFinite(status) && status >= 500) return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("internal error") ||
    message.includes("unavailable") ||
    message.includes("deadline exceeded") ||
    message.includes("timed out")
  );
}

class GlobalRateLimitController {
  constructor() {
    this.pauseUntil = 0;
    this.currentPausePromise = null;
  }

  async waitIfPaused() {
    const now = Date.now();
    if (this.pauseUntil <= now) {
      return;
    }
    if (!this.currentPausePromise) {
      const waitMs = this.pauseUntil - now;
      this.currentPausePromise = sleep(waitMs).finally(() => {
        this.currentPausePromise = null;
      });
    }
    await this.currentPausePromise;
  }

  async triggerPause(label) {
    const now = Date.now();
    const nextPauseUntil = now + GLOBAL_RATE_LIMIT_PAUSE_MS;
    if (nextPauseUntil > this.pauseUntil) {
      this.pauseUntil = nextPauseUntil;
      console.warn(
        `[${label}] Rate limit hit. Global pause for ${GLOBAL_RATE_LIMIT_PAUSE_MS}ms is now active.`,
      );
    }
    await this.waitIfPaused();
  }
}

async function callWithPolicy(globalRateController, label, requestFn) {
  let transientRetryCount = 0;
  let rateLimitHitCount = 0;

  while (true) {
    await globalRateController.waitIfPaused();
    try {
      return await withTimeout(requestFn(), GEMINI_CALL_TIMEOUT_MS, label);
    } catch (error) {
      if (isRateLimitError(error)) {
        if (rateLimitHitCount === 0) {
          rateLimitHitCount += 1;
          await globalRateController.triggerPause(label);
          continue;
        }
        throw new SkipUnitError(`[${label}] Skipped after second rate-limit event.`);
      }

      if (!isRetryableError(error) || transientRetryCount >= MAX_TRANSIENT_RETRIES) {
        throw new SkipUnitError(
          `[${label}] skipped after ${transientRetryCount} retries. Last error: ${String(error?.message || error)}`,
        );
      }

      transientRetryCount += 1;
      const waitMs = TRANSIENT_RETRY_INTERVAL_MS;
      console.warn(`[${label}] transient retry ${transientRetryCount}/${MAX_TRANSIENT_RETRIES} in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runNext() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

async function getVideoDurationSec(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
    let output = "";
    let errorOutput = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });
    ffprobe.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed with ${code}: ${errorOutput}`));
        return;
      }
      const duration = Number.parseFloat(output.trim());
      if (Number.isNaN(duration)) {
        reject(new Error("Unable to parse ffprobe duration."));
        return;
      }
      resolve(duration);
    });
  });
}

async function getVideoFps(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=r_frame_rate",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
    let output = "";
    let errorOutput = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });
    ffprobe.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed with ${code}: ${errorOutput}`));
        return;
      }
      const raw = output.trim();
      if (!raw) {
        resolve(null);
        return;
      }
      const [num, den] = raw.split("/").map(Number);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
        resolve(num / den);
        return;
      }
      const parsed = Number.parseFloat(raw);
      resolve(Number.isFinite(parsed) ? parsed : null);
    });
  });
}

function buildSegments(durationSec) {
  const segments = [];
  let start = 0;
  while (start < durationSec) {
    const end = Math.min(start + CHUNK_SECONDS, durationSec);
    segments.push({
      startSec: Number(start.toFixed(3)),
      endSec: Number(end.toFixed(3)),
    });
    if (end >= durationSec) break;
    start = Math.max(0, end - CHUNK_OVERLAP_SECONDS);
  }
  return segments;
}

function coerceJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}

function toTimecode(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(
    2,
    "0",
  )},${String(ms).padStart(3, "0")}`;
}

function generateSrt(behaviors) {
  return behaviors
    .map((behavior, index) => {
      const label =
        behavior.modality === "audio"
          ? `[audio] ${behavior.behavior}`
          : `[visual] ${behavior.behavior}`;
      return [
        String(index + 1),
        `${toTimecode(behavior.startSec)} --> ${toTimecode(behavior.endSec)}`,
        label,
        "",
      ].join("\n");
    })
    .join("\n");
}

async function burnSubtitles(inputPath, outputPath, srtPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      `subtitles=${srtPath.replace(/:/g, "\\:")}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed with ${code}: ${stderr}`));
        return;
      }
      resolve();
    });
  });
}

async function burnTimestampOverlay(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      "drawtext=text='%{pts\\:hms}':x=20:y=20:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg timestamp overlay failed with ${code}: ${stderr}`));
        return;
      }
      resolve();
    });
  });
}

async function waitForFileReady(ai, fileName) {
  const deadline = Date.now() + FILE_READY_TIMEOUT_MS;
  let file = await withTimeout(ai.files.get({ name: fileName }), GEMINI_CALL_TIMEOUT_MS, "file-get");
  while (file.state === "PROCESSING") {
    if (Date.now() > deadline) {
      throw new Error(`Gemini file stayed PROCESSING beyond ${FILE_READY_TIMEOUT_MS}ms`);
    }
    await sleep(1000);
    file = await withTimeout(ai.files.get({ name: fileName }), GEMINI_CALL_TIMEOUT_MS, "file-get");
  }
  if (file.state !== "ACTIVE") {
    throw new Error(`Uploaded file is not ACTIVE (state=${file.state}).`);
  }
  return file;
}

function buildVideoPart(fileUri, startSec, endSec, fps) {
  return {
    fileData: { fileUri, mimeType: "video/mp4" },
    videoMetadata: {
      startOffset: `${startSec.toFixed(3)}s`,
      endOffset: `${endSec.toFixed(3)}s`,
      fps,
    },
  };
}

function detectionPrompt(chunkStart, chunkEnd) {
  const behaviorDefinitions = BEHAVIORS.map(
    (behavior) => `- ${behavior}: ${BEHAVIOR_DEFINITIONS[behavior] || "Use standard clinical meaning."}`,
  ).join("\n");
  return [
    "You are analyzing a therapy session video for an autistic child.",
    "Only detect behaviors performed by the child. Ignore therapist actions.",
    "Return ONLY JSON array. No markdown.",
    `Each item: {"behavior": one of [${BEHAVIORS.join(", ")}], "startSec": number, "endSec": number, "modality": "visual"|"audio", "notes": string}.`,
    `This clip spans ${chunkStart}s to ${chunkEnd}s of the full video.`,
    "Timestamps must be clip-relative and precise.",
    "Each continuous episode must be one single item with a start and end, not per-second fragments.",
    "Prefer true duration windows over point timestamps.",
    "If a behavior persists, keep one longer window instead of many tiny windows.",
    "For very short events, still provide a non-zero range when possible.",
    "If no behavior is present, return [].",
    "Use the following behavior definitions strictly:",
    behaviorDefinitions,
    `Visual behaviors: ${VISUAL_BEHAVIORS.join(", ")}`,
    `Audio behaviors: ${AUDIO_BEHAVIORS.join(", ")}`,
  ].join("\n");
}

function strictJsonReminderPrompt() {
  return [
    "Return ONLY valid JSON matching the schema.",
    "Do not include markdown fences.",
    "Do not include explanatory text.",
  ].join("\n");
}

function validationPrompt(behavior, clipDurationSec) {
  const definition = BEHAVIOR_DEFINITIONS[behavior] || "Use standard clinical meaning.";
  const modality = VISUAL_BEHAVIORS.includes(behavior)
    ? "visual"
    : AUDIO_BEHAVIORS.includes(behavior)
      ? "audio"
      : "unknown";
  return [
    "You are validating one behavior segment in a therapy video.",
    `Behavior: ${behavior}`,
    `Modality: ${modality}`,
    `Definition: ${definition}`,
    `You are given a short clip of duration ${clipDurationSec.toFixed(3)} seconds.`,
    "Determine whether this behavior exists in the clip for the child.",
    "If present, return refined clip-relative startSec and endSec covering the full continuous behavior interval.",
    "Prefer a meaningful duration window; avoid point timestamps unless truly instantaneous.",
    `startSec and endSec must be between 0 and ${clipDurationSec.toFixed(3)}.`,
    "Return ONLY JSON:",
    '{"correct": true|false, "startSec": number, "endSec": number}',
    "If behavior is absent, set correct=false.",
  ].join("\n");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function enforceMinimumDuration(startSec, endSec, minDurationSec = MIN_ACTION_DURATION_SECONDS) {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    return null;
  }
  const normalizedStart = Number(startSec);
  const normalizedEnd = Number(endSec);
  if (normalizedEnd - normalizedStart >= minDurationSec) {
    return { startSec: normalizedStart, endSec: normalizedEnd };
  }
  return {
    startSec: normalizedStart,
    endSec: normalizedStart + minDurationSec,
  };
}

function mergeBehaviors(items) {
  const sorted = [...items].sort((a, b) => a.startSec - b.startSec);
  const merged = [];
  const latestByKey = new Map();

  for (const item of sorted) {
    const key = `${item.behavior}|${item.modality}`;
    const lastIndex = latestByKey.get(key);
    if (lastIndex === undefined) {
      merged.push({ ...item });
      latestByKey.set(key, merged.length - 1);
      continue;
    }

    const last = merged[lastIndex];
    if (item.startSec <= last.endSec + MERGE_GAP_SECONDS) {
      last.endSec = Math.max(last.endSec, item.endSec);
      if (item.notes && !last.notes.includes(item.notes)) {
        last.notes = last.notes ? `${last.notes}; ${item.notes}` : item.notes;
      }
      continue;
    }

    merged.push({ ...item });
    latestByKey.set(key, merged.length - 1);
  }

  return merged;
}

function dominantBehavior(behaviors) {
  const byBehavior = new Map();
  for (const entry of behaviors) {
    byBehavior.set(entry.behavior, (byBehavior.get(entry.behavior) || 0) + 1);
  }
  let winner = null;
  let bestCount = -1;
  for (const [behavior, count] of byBehavior.entries()) {
    if (count > bestCount) {
      bestCount = count;
      winner = behavior;
    }
  }
  return winner;
}

export async function analyzeVideo({
  videoPath,
  outputDir,
  geminiApiKey,
  model = MODEL,
  logger = console,
}) {
  if (!geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Input video not found: ${videoPath}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const globalRateController = new GlobalRateLimitController();

  let analysisInputPath = videoPath;
  const timestampedInputPath = path.join(outputDir, "analysis_input_timestamped.mp4");
  try {
    logger.log("Applying timestamp overlay before analysis...");
    await burnTimestampOverlay(videoPath, timestampedInputPath);
    analysisInputPath = timestampedInputPath;
  } catch (error) {
    logger.warn(
      `Timestamp overlay failed. Proceeding with original video. Reason: ${String(error?.message || error)}`,
    );
  }

  logger.log(`Uploading video to Gemini: ${analysisInputPath}`);
  const uploaded = await withTimeout(
    ai.files.upload({
      file: analysisInputPath,
      config: { mimeType: "video/mp4" },
    }),
    GEMINI_CALL_TIMEOUT_MS,
    "file-upload",
  );
  const geminiFile = await waitForFileReady(ai, uploaded.name);

  const durationSec = await getVideoDurationSec(analysisInputPath);
  const sourceFps = await getVideoFps(analysisInputPath);
  const clipFps = Number.isFinite(sourceFps) ? Math.min(sourceFps, MAX_CLIP_FPS) : MAX_CLIP_FPS;
  const segments = buildSegments(durationSec);
  logger.log(
    `Video duration=${durationSec.toFixed(2)}s, sourceFps=${sourceFps || "unknown"}, segmentCount=${segments.length}`,
  );

  const detectionsBySegment = await runWithConcurrency(segments, CONCURRENCY, async (segment, index) => {
    const prompt = detectionPrompt(segment.startSec, segment.endSec);
    try {
      const response = await callWithPolicy(globalRateController, `detect-${index}`, () =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                buildVideoPart(geminiFile.uri, segment.startSec, segment.endSec, clipFps),
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: TEMPERATURE,
            responseMimeType: "application/json",
            responseSchema: DETECTION_RESPONSE_SCHEMA,
          },
        }),
      );

      let parsed = response.parsed ?? coerceJson(response.text);
      if (!Array.isArray(parsed)) {
        const fallback = await callWithPolicy(globalRateController, `detect-${index}-fallback`, () =>
          ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  buildVideoPart(geminiFile.uri, segment.startSec, segment.endSec, clipFps),
                  { text: `${prompt}\n${strictJsonReminderPrompt()}` },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              responseSchema: DETECTION_RESPONSE_SCHEMA,
            },
          }),
        );
        parsed = fallback.parsed ?? coerceJson(fallback.text);
      }
      if (!Array.isArray(parsed)) {
        logger.warn(`detect-${index}: non-array response, skipping segment output.`);
        return [];
      }

      return parsed
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const behavior = String(item.behavior || "").toLowerCase().trim();
          const inferredModality = VISUAL_BEHAVIORS.includes(behavior)
            ? "visual"
            : AUDIO_BEHAVIORS.includes(behavior)
              ? "audio"
              : "";
          const providedModality = String(item.modality || "")
            .toLowerCase()
            .trim();
          return {
            behavior,
            modality: providedModality || inferredModality,
            startSec: Number(item.startSec) + segment.startSec,
            endSec: Number(item.endSec) + segment.startSec,
            notes: String(item.notes || "").trim(),
          };
        })
        .map((item) => {
          const adjusted = enforceMinimumDuration(item.startSec, item.endSec);
          if (!adjusted) return null;
          return {
            ...item,
            startSec: adjusted.startSec,
            endSec: adjusted.endSec,
          };
        })
        .filter(
          (item) =>
            Boolean(item) &&
            BEHAVIORS.includes(item.behavior) &&
            (item.modality === "visual" || item.modality === "audio") &&
            Number.isFinite(item.startSec) &&
            Number.isFinite(item.endSec) &&
            item.endSec > item.startSec,
        )
        .map((item) => ({
          ...item,
          startSec: Number(item.startSec.toFixed(3)),
          endSec: Number(item.endSec.toFixed(3)),
        }));
    } catch (error) {
      if (error instanceof SkipUnitError) {
        logger.warn(`${error.message} segment dropped.`);
        return [];
      }
      logger.warn(
        `detect-${index}: failed after retries, dropping segment. Reason: ${String(error?.message || error)}`,
      );
      return [];
    }
  });

  const rawDetections = detectionsBySegment.flat();
  const rawPath = path.join(outputDir, "behaviors_raw.json");
  fs.writeFileSync(rawPath, JSON.stringify(rawDetections, null, 2));

  // Merge first so validation operates on continuous windows instead of fragmented slices.
  const mergedBeforeValidation = mergeBehaviors(rawDetections).map((entry) => ({
    ...entry,
    startSec: Number(entry.startSec.toFixed(3)),
    endSec: Number(entry.endSec.toFixed(3)),
  }));

  const validatedEntries = await runWithConcurrency(mergedBeforeValidation, CONCURRENCY, async (item, index) => {
    const localStart = Math.max(0, item.startSec - VALIDATION_MARGIN_SECONDS);
    const localEnd = Math.min(durationSec, item.endSec + VALIDATION_MARGIN_SECONDS);
    const clipDurationSec = Math.max(0.01, localEnd - localStart);
    const prompt = validationPrompt(item.behavior, clipDurationSec);
    try {
      const response = await callWithPolicy(globalRateController, `validate-${index}`, () =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [buildVideoPart(geminiFile.uri, localStart, localEnd, clipFps), { text: prompt }],
            },
          ],
          generationConfig: {
            temperature: TEMPERATURE,
            responseMimeType: "application/json",
            responseSchema: VALIDATION_RESPONSE_SCHEMA,
          },
        }),
      );

      let parsed = response.parsed ?? coerceJson(response.text);
      if (!parsed || typeof parsed !== "object") {
        const fallback = await callWithPolicy(globalRateController, `validate-${index}-fallback`, () =>
          ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  buildVideoPart(geminiFile.uri, localStart, localEnd, clipFps),
                  { text: `${prompt}\n${strictJsonReminderPrompt()}` },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              responseSchema: VALIDATION_RESPONSE_SCHEMA,
            },
          }),
        );
        parsed = fallback.parsed ?? coerceJson(fallback.text);
      }
      if (!parsed || typeof parsed !== "object") {
        return { ...item, correct: false, skipped: true, skipReason: "invalid_validation_payload" };
      }
      const correct = Boolean(parsed.correct);
      if (!correct) {
        return { ...item, correct: false };
      }

      const refinedStartLocal = Number(parsed.startSec);
      const refinedEndLocal = Number(parsed.endSec);
      const refinedStartGlobal = Number.isFinite(refinedStartLocal)
        ? clamp(localStart + refinedStartLocal, localStart, localEnd)
        : item.startSec;
      const refinedEndGlobal = Number.isFinite(refinedEndLocal)
        ? clamp(localStart + refinedEndLocal, refinedStartGlobal + 0.01, localEnd)
        : item.endSec;
      const adjusted = enforceMinimumDuration(refinedStartGlobal, refinedEndGlobal);
      if (!adjusted) {
        return { ...item, correct: false, skipped: true, skipReason: "invalid_refined_duration" };
      }

      return {
        ...item,
        correct: true,
        startSec: Number(adjusted.startSec.toFixed(3)),
        endSec: Number(adjusted.endSec.toFixed(3)),
      };
    } catch (error) {
      if (error instanceof SkipUnitError) {
        logger.warn(`${error.message} validation dropped.`);
        return {
          ...item,
          correct: true,
          skipped: true,
          skipReason: "validation_skipped_assumed_true",
        };
      }
      logger.warn(
        `validate-${index}: failed after retries, dropping validation item. Reason: ${String(
          error?.message || error,
        )}`,
      );
      return {
        ...item,
        correct: true,
        skipped: true,
        skipReason: "validation_failed_assumed_true",
      };
    }
  });

  const validatedOnly = validatedEntries.filter((entry) => entry.correct);
  const merged = mergeBehaviors(validatedOnly).map((entry) => ({
    ...entry,
    startSec: Number(entry.startSec.toFixed(3)),
    endSec: Number(entry.endSec.toFixed(3)),
  }));

  const validatedPath = path.join(outputDir, "behaviors_validated.json");
  const finalPath = path.join(outputDir, "behaviors_final.json");
  const srtPath = path.join(outputDir, "behaviors.srt");
  const outputVideoPath = path.join(outputDir, "video_with_behaviors.mp4");

  fs.writeFileSync(validatedPath, JSON.stringify(validatedOnly, null, 2));
  fs.writeFileSync(
    finalPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dominantCategory: dominantBehavior(merged),
        totalBehaviors: merged.length,
        behaviors: merged,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(srtPath, generateSrt(merged));
  await burnSubtitles(analysisInputPath, outputVideoPath, srtPath);

  return {
    durationSec,
    rawPath,
    validatedPath,
    finalPath,
    srtPath,
    outputVideoPath,
    behaviors: merged,
    dominantCategory: dominantBehavior(merged),
  };
}

