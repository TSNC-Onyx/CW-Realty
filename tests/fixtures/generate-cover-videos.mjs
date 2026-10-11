// Makes the small MP4 clips used by the automatic-cover tests (docs/cwr-video-auto-cover-plan.md):
// cover-normal.mp4 shows a picture from 0:00; cover-black-start.mp4 is black for its first
// half second, then shows a picture. Recorded in Playwright's Chromium, so no extra tools are needed.
// Usage: node tests/fixtures/generate-cover-videos.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const FIXTURES_DIR = path.dirname(new URL(import.meta.url).pathname);
const CLIP_SECONDS = 2.5;
const CLIPS = [
  { fileName: "cover-normal.mp4", blackSeconds: 0 },
  { fileName: "cover-black-start.mp4", blackSeconds: 0.5 },
];

// Runs in the browser: draws a 320×180 canvas (black, then a sky and a house shape) and records it.
async function recordClip({ blackSeconds, clipSeconds }) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  const drawFrame = (seconds) => {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, 320, 180);
    if (seconds < blackSeconds) return;
    context.fillStyle = "#7fa7d9";
    context.fillRect(0, 0, 320, 180);
    context.fillStyle = "#8a5a3c";
    context.fillRect(120, 80, 80, 70);
  };
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/mp4;codecs=avc1", videoBitsPerSecond: 250_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));
  const start = performance.now();
  drawFrame(0);
  recorder.start();
  await new Promise((resolve) => {
    const tick = () => {
      const seconds = (performance.now() - start) / 1000;
      drawFrame(seconds);
      if (seconds >= clipSeconds) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const clip of CLIPS) {
  const bytes = await page.evaluate(recordClip, { blackSeconds: clip.blackSeconds, clipSeconds: CLIP_SECONDS });
  await writeFile(path.join(FIXTURES_DIR, clip.fileName), Buffer.from(bytes));
  console.log(`${clip.fileName}: ${bytes.length} bytes`);
}
await browser.close();
