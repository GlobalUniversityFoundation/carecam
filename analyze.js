import dotenv from "dotenv";
import path from "node:path";
import { analyzeVideo } from "./worker/analyzer-core.mjs";

dotenv.config();

async function main() {
  const videoPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(process.cwd(), "video.mp4");
  const outputDir = path.resolve(process.cwd(), "output");
  const result = await analyzeVideo({
    videoPath,
    outputDir,
    geminiApiKey: process.env.GEMINI_API_KEY,
    logger: console,
  });
  console.log("Analysis complete.");
  console.log(`Dominant category: ${result.dominantCategory || "-"}`);
  console.log(`Processed video: ${result.outputVideoPath}`);
  console.log(`Final JSON: ${result.finalPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

