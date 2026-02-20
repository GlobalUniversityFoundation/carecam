This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Async Video Worker (Cloud Run + Pub/Sub + GCS)

This repo includes a backend worker for processing uploaded child-session videos asynchronously.

- Entry point: `worker/server.mjs`
- Core processing logic: `worker/process-video-job.mjs`
- Analyzer pipeline: `worker/analyzer-core.mjs`

### What It Does

When a video is uploaded under `carecam/child_videos/...`:

1. A GCS `OBJECT_FINALIZE` notification is pushed to the worker.
2. Worker loads the related session JSON in `carecam/child_video_sessions/...`.
3. Status is updated to `Processing`.
4. Analyzer runs behavior detection + validation with:
   - concurrency = 5
   - global pause for 5 minutes on first rate-limit hit
   - skip that unit on second rate-limit hit
   - merged contiguous behavior spans to reduce timestamp fragmentation
5. Worker uploads outputs to `carecam/child_video_analysis/<icd>/<uploadEpoch>/`:
   - `video_with_behaviors.mp4`
   - `behaviors_final.json`
   - `behaviors_validated.json`
   - `behaviors_raw.json`
6. Session JSON is updated with output paths, dominant category, and `Reviewed` status.

On failure, session is updated to `Failed` with `processingError`.

### Required Environment Variables

- `FIREBASE_STORAGE_BUCKET` (defaults to `video-analytics-465406.firebasestorage.app`)
- `FIREBASE_SERVICE_ACCOUNT_PATH` (path to Firebase Admin JSON)
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)
- `WORKER_API_TOKEN` (optional; if set, worker expects `Authorization: Bearer <token>`)

### Local Worker Run

```bash
npm run worker:start
```

### Development Event Wiring (done)

`POST /api/children/videos` now auto-emits a local Storage-finalize style event in development.

So in local dev, use:

```bash
npm run dev:all
```

This runs:
- Next.js app (`next dev`)
- Worker server (`node worker/server.mjs`)

Optional env vars for local event bridge:
- `WORKER_LOCAL_ENDPOINT` (default: `http://127.0.0.1:8080/pubsub/storage-finalize`)
- `WORKER_AUTO_TRIGGER_UPLOADS` (`true`/`false`; defaults to `true` in development)
- `WORKER_API_TOKEN` (if worker auth is enabled)

Health check:

```bash
curl http://localhost:8080/healthz
```

### Local Analyzer Run

```bash
npm run analyze:local -- /absolute/path/to/video.mp4
```

### Deployment Shape

Recommended production path:

1. Deploy worker to Cloud Run (`worker:start`).
2. Create a Pub/Sub topic and push subscription to:
   - `POST /pubsub/storage-finalize`
3. Configure Storage notifications for your bucket to send `OBJECT_FINALIZE` events to that topic.
4. Set Cloud Run concurrency low (typically `1`) for stable ffmpeg/Gemini workloads.
