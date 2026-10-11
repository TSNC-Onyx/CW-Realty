# Automatic video cover — plan

> Owner decision 2026-10-02: Option A with the black-frame fallback. When a Homework video is uploaded and the item has no cover picture, the admin's browser takes the frame at 0:00 as the cover; if that frame is almost completely black, it uses the frame at 1 second instead.
> Owner said "build it" on 2026-10-02. Applying the migration to the production database needs a separate owner approval.

## Goal

Every Homework video shows a real picture before it plays, without anyone having to make one, while a cover the admin uploads always wins.

## Architecture context

- Public: `app/(site)/resources/page.tsx` `VideoCard` renders `<video preload="none" poster=…>` from `homework_items.photo_*`. With no cover, visitors see an empty dark box (the admin note "visitors see the video's first frame" is wrong today). Checked on the live site 2026-10-02: "Do the math" shows exactly that.
- Admin video upload: `src/components/admin/homework/use-homework-upload.ts` already opens the chosen file in the browser (`readVideoSeconds`, object URL, 15 s timeout) before uploading it straight to storage, then `saveHomeworkFileAction` records it.
- Cover pictures: `PhotoPicker` → `usePhotoUpload` → `encodePhoto` (decode → AVIF/WebP at 640/1280/1920 in a worker; widths above the original stay at the original size) → `requestPhotoUploadAction` (folder `homework/{itemId}/{uuid}`) → `setHomeworkCoverAction` (checks all files exist, then writes `photo_path/alt/width/height`).
- Problem logging: every message shown to an admin is also recorded (`reportClientProblem`), per the owner's 2026-09-27 rule.

## How it works (happy path)

1. Admin chooses an MP4 and presses Upload video (unchanged).
2. After the video is saved, the browser opens the chosen file again and captures the 0:00 frame — only when the item has no cover, or its cover was made automatically.
3. Black check: the frame is shrunk to 32×18 (576 pixels, enough to judge and instant to measure) and each pixel's brightness is measured with the WCAG / Rec. 709 weights (0.2126 R + 0.7152 G + 0.0722 B) on the stored 0–255 values (luma; skipping sRGB linearization is deliberate, because darkness as people see it is what matters). Named constants: a pixel is "dark" below 10% brightness (`DARK_PIXEL_LUMA = 26`, just above video black level 16), and a frame is "black" when at least 98% of pixels are dark (`BLACK_FRAME_SHARE = 0.98`), which still keeps genuinely dark scenes such as a night exterior with lit windows. Black frames fall back to the 1-second frame.
4. The video uploads and saves exactly as today. Only after the video is saved is the frame captured, encoded (same AVIF/WebP pipeline), uploaded, and saved, so a failed video never leaves a stray cover.
5. Progress shows "Making a cover picture…" during that step. Two messages follow: the usual "Uploaded and shown on the Homework page." (or "File replaced…"), then "Cover picture made from the video's opening scene. You can replace it below."
6. The Cover picture panel shows the picture with a small note "Made from the video's opening scene", plus the usual Replace and Remove (with Undo).

## Frame capture rules (reliability)

- A hidden, detached `<video>` with `muted`, `playsInline` and `preload="auto"` reads the local file through an object URL; the file is never uploaded for this step, and the canvas stays usable because the source is the admin's own file.
- 0:00: draw only after `loadeddata` **and** `readyState >= HAVE_CURRENT_DATA` and `videoWidth/videoHeight > 0` (drawing earlier throws or draws nothing).
- 1 s: set `currentTime = 1`, wait for `seeked` (or `error`), then wait until `readyState >= HAVE_CURRENT_DATA` with a non-zero picture size (re-checked on `loadeddata`, `canplay`, `seeked`, and `timeupdate`) before drawing. `requestVideoFrameCallback` is deliberately not used: testing during the build showed it never fires for a video that isn't on screen, so it would only ever end in the time limit.
- A file with data but no picture (sound only) ends at once as "couldn't read", not after the time limit.
- The canvas is sized from `videoWidth/videoHeight` read at draw time (they can change while loading), capped at 1920 wide.
- No `play()` call is needed, so iPhone autoplay rules don't apply.
- Every step shares one 15-second limit; `error` (decode / unsupported) and the limit both end with "no frame". A frame that arrives after the limit is closed so its memory is freed.
- On every outcome (frame, black, error, timeout): clear `src`, call `load()` to release the decoder, and revoke the object URL (`finally`). The video is never played, so there is nothing to pause.
- Encoding uses the site's existing AVIF/WebP encoder (WebAssembly in a worker), not the browser's canvas export, so Safari's missing WebP export cannot silently produce a large PNG.

## Security rule change (owner approved 2026-10-02)

Opening the chosen file uses a `blob:` link made by the page itself. The site's Content Security Policy only allowed videos from the site and its storage, so browsers refused it — which also meant the existing "length filled in for you" reader had never worked. Admin pages (and only admin pages) now add `blob:` to `media-src` (`allowLocalMedia` in `src/lib/security/content-security-policy.ts`, set from `middleware.ts`). Visitors' pages are unchanged and nothing else is loosened. Alternatives considered and declined: re-downloading the uploaded copy from storage (up to 50 MB again), or a video-decoding library (large, patchy iPhone support). Covered by a unit test and a header test that checks admin has it and public pages don't.

## Edge cases and solutions (most → least critical)

| # | Edge case | Solution |
|---|---|---|
| 1 | Admin already uploaded their own cover | Never touched. The automatic step runs only when there is no cover or the current cover is automatic. Checked again on the server at save time. |
| 2 | Someone uploads their own cover while the automatic one is being saved (two admins, two tabs) | The server saves the automatic cover only if the item still has no cover or an automatic one (conditional update); otherwise it keeps the uploaded one, and the unused automatic picture files are left the same way a replaced cover's files are today. |
| 3 | Browser can't decode the video (e.g. an MP4 recorded as HEVC on an iPhone, opened in Chrome/Firefox), or the file has no picture | The video still uploads. Message: "This browser couldn't read the video to make a cover picture. Add one below." Recorded as an info problem (`homework.make_cover`, `decode_error`). |
| 4 | 0:00 and 1 s are both black (or the video is shorter than 1 s and 0:00 is black) | No cover is made (a black cover looks the same as none). Message suggests adding one. Recorded as info. |
| 5 | Frame never arrives (slow or stuck decoding) | 15-second limit (same as today's length check); message "Making a cover picture took too long. Add one below."; recorded (`timeout`). |
| 6 | Video upload fails | Nothing is saved for the cover (cover saves only after the video saves). Existing upload error handling unchanged. |
| 7 | Cover encoding, upload, or save fails after the video saved | Video stays saved. Message: "The video is saved, but its cover picture didn't save. Add one below." with a reference code; recorded under `homework.make_cover` (server failures are recorded by the server action). |
| 8 | Admin replaces the video later | If the cover is automatic, a new one is made from the new video; if it was uploaded by the admin, it stays. |
| 9 | Admin removes an automatic cover | It stays removed until the next video upload; Undo restores it. The Remove message is corrected to "Visitors see a dark box until a cover is added." |
| 10 | Admin uploads their own cover over an automatic one | Replaces it and is marked as uploaded, so later video uploads never overwrite it. |
| 11 | Portrait (phone-upright) or square video, or an iPhone clip with rotation metadata | The frame keeps the video's displayed shape; the public player already crops covers to 16:9 with `object-cover`. Older browsers could ignore rotation when drawing video, so a portrait iPhone clip is checked by hand on iPhone Safari and desktop Chrome before release; if one ever comes out sideways, the admin replaces it in one click. |
| 12 | Very large (4K) or very small video | Frame is encoded at most 1920 wide; small videos are saved at their own size (existing encoder rule). |
| 13 | Description for screen readers (cover pictures require one) | Stored as "Opening scene of this video" — stays true if the title changes; the video itself keeps its own name ("[title] video"). |
| 14 | Admin leaves the page mid-way | Same as today's upload: nothing half-saved; the cover is only recorded after its files are all present. |
| 15 | Memory | The browser frees the video it opened (revokes the object URL) on every outcome. |
| 16 | Videos uploaded before this feature with no cover | Not covered: the feature runs only on new uploads (owner kept this scope 2026-10-02). On the live site today, "Do the math" has no cover ("Buyers working with real estate agents" has one). It can get a cover by uploading one by hand, or by uploading its video file again after this ships. A later "Make cover from video" button is possible: stored videos are served with `Access-Control-Allow-Origin: *`, so the browser can read them back. |

## Task breakdown (when approved)

1. Migration `cwr_homework_cover_from_video.sql`: add `homework_items.is_photo_from_video boolean not null default false` with a check that it is false when there is no cover. Production apply needs separate owner approval.
2. `src/lib/admin/photos/encode-photo.ts`: add `encodePhotoBitmap(bitmap)` (shares the worker path) so a captured frame skips the file-type check.
3. New `src/lib/admin/homework/video-frame.ts` (browser): `fetchCoverFrame(file)` → captures 0:00, checks blackness, tries 1 s; returns an ImageBitmap or a typed "no frame" reason; always revokes the object URL; 15 s timeout.
4. New pure `getIsNearBlack(pixels)` in `src/lib/admin/homework/frame-brightness.ts` (unit-tested).
5. `use-homework-upload.ts` + `make-video-cover.ts`: after `saveHomeworkFileAction` succeeds, capture → encode → upload → `setHomeworkVideoCoverAction`; new "cover" progress stage; messages and problem records for #3–#7.
6. `src/lib/admin/homework/actions.ts`: `setHomeworkVideoCoverAction` (conditional update: only when `photo_path is null or is_photo_from_video`); `setHomeworkCoverAction` and `removeHomeworkCoverAction` set the flag to false; corrected Remove message.
7. `homework-file-panels.tsx`: Cover panel note "Made from the video's opening scene" when automatic; corrected help text; the item's current cover state passed to the video upload.
8. Problem catalog: `homework.make_cover` in `src/lib/observability/problem-catalog.ts` and in the database list `cwr.problem_catalog` (same migration).
9. Tests:
   - Unit: brightness rule (all black, video black with noise, dark-but-real night scene, normal, exactly at and just past the 98% line, dark blue); frame choice (0 s fine / 0 s black → 1 s / both black → none / shorter than 1 s → 0 s only / read failure passed on). The object URL is revoked in a `finally`; the unit tests run without a browser, so that path is checked by review and the e2e runs rather than a unit test.
   - pgTAP: new items start without the flag; the flag cannot be true without a cover; removing the cover requires clearing the flag. (The "leave an uploaded cover alone" rule lives in the server action's filter, so it is tested end to end with two tabs.)
   - e2e: fixtures are tiny H.264 MP4s recorded in Playwright's Chromium (which, it turned out, does decode H.264) by `tests/fixtures/generate-cover-videos.mjs`: `cover-normal.mp4` and `cover-black-start.mp4` (black for its first half second); `cover-unreadable.mp4` is a text file that no browser can read. Cases: cover made and labeled; 1 s fallback used and the saved cover measured as not black; unreadable file explained; an uploaded cover never replaced; a cover uploaded in another tab during the video upload kept (server guard); replacing the video refreshes an automatic cover; Undo after removing restores it as automatic; axe clean; admin-only `blob:` media header.
   - Manual before release: real H.264 and HEVC phone clips (landscape and portrait) on iPhone Safari, Mac Safari, Chrome, Firefox.
10. Verify: typecheck, lint, unit, pgTAP, e2e, design check, build; reset local DB and re-import real content.

## DO NOT TOUCH

Public video player markup and `preload="none"`, CWR TouchUp video and its owner-chosen cover, listing/team photo flows, storage bucket rules, captions flow.

## Audit

Sources: MDN (HTMLMediaElement loadeddata / readyState / seeked / error, HTMLVideoElement videoWidth and requestVideoFrameCallback, drawImage, createImageBitmap, createObjectURL, CORS-enabled images, toBlob, video codec guide, canPlayType, `<video>`), web.dev (requestVideoFrameCallback, LCP, video and source tags, CLS), WebKit "New video policies for iOS", caniuse (HEVC, AVIF, canvas WebP export), W3C (relative luminance; WCAG 2.2 SC 4.1.3 status messages; decorative images; media player), NN/g 10 usability heuristics.

| # | Criterion | Draft | Final | Evidence in the plan |
|---|---|---|---|---|
| 1 | Reliable frame capture | B (draw timing unspecified) | A | `loadeddata` + `readyState ≥ 2` + non-zero size; `seeked` + readyState re-check (rVFC dropped after testing: it never fires off screen); muted/playsinline; one shared timeout |
| 2 | Codec/format fallback | A | A | `error` handled; upload continues; admin told to add a cover; recorded; HEVC tested by hand |
| 3 | Security/privacy | B (element cleanup missing) | A | Object URL revoked in `finally`; `src` cleared and decoder released; nothing uploaded to read the frame |
| 4 | Near-black detection | B (no dark-scene test, unexplained numbers) | A | WCAG/709 weights; 32×18 sample; named, justified constants; unit tests incl. dark-but-real scene |
| 5 | Poster best practice | A | A | Public player already reserves 16:9 (`aspect-video`) so no layout shift; poster served at 1280 WebP (not full size); not lazy; existing WASM encoder avoids silent PNG |
| 6 | Accessibility | A | A | Progress and results use existing `role="status"` / `role="alert"` messages; public video keeps its own name; admin thumbnail has a description |
| 7 | UX: status and control | A | A | "Making a cover picture…" step; "Made from the video's opening scene" label; one-click Replace/Remove with Undo; uploaded covers never overwritten |
| 8 | Style compliance (site rules §11) | A | A | Only existing messages, progress text, Small/muted note, buttons; no new colors, sizes, or components |
| 9 | Error logging (owner rule 2026-09-27) | A | A | Every shown failure (#3–#7) also recorded; info severity for expected cases, reference code for real failures |
