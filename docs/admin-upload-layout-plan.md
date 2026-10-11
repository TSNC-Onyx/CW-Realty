# Admin upload layout — plan

Owner request 2026-10-10: improve the desktop photo-upload layout of admin New/Edit Listing and
Add Connection, and fix "Add Video has nowhere to upload". Prototype shown 2026-10-10; owner chose
**upload together on save** and asked to build it.

## Goal

The three Add pages (listing, connection, video) take their photos / video in the same step as the
first save, in a two-column desktop layout; the Edit Listing page shows photos as a compact grid
with drag-to-reorder and descriptions that save on their own.

## Scope

In scope:

1. **Add listing** (`/admin/listings/new`): two columns from `xl` (1280px): details left, a Photos
   panel right. Pick or drop several photos; each has a required description, Remove, and move
   earlier/later (buttons + drag). Short fields side by side (City · State · ZIP; Price · Square
   feet; Bedrooms · Bathrooms). **Save as draft** creates the listing, then uploads the photos in
   order, then opens the Edit page.
2. **Edit listing** (`/admin/listings/[id]`): one status/publishing strip; photo grid 2 / 3 / 5
   across (main photo spans 2×2); per photo: badge, Move earlier / Move later / Remove (always
   visible below `lg`, on hover/focus at `lg`+), drag to reorder, description saved on blur.
   "Add photos" uses the same multi-photo queue with its own Upload button. Details form uses the
   same side-by-side rows.
3. **Add connection** (`/admin/connections/new`): two columns: details left; right: Photo (optional,
   one portrait + required description when chosen) and a live preview card. **Add connection**
   creates, uploads the photo, then opens the Edit page. Phone · Email side by side.
4. **Edit connection** (`/admin/connections/[id]`): same two-column form; right column holds the
   existing photo panel (`ConnectionPhoto`) and the live preview.
5. **Add video** (`/admin/homework/new-video`): two columns: details left; right: Video file
   (required; local player preview; checked against the upload rules when chosen), Cover picture
   (optional; otherwise made from the opening scene as today), Captions (optional .vtt).
   **Add video** creates, uploads the video (with %), then the cover photo if chosen, then the
   captions, then opens the Edit page.
6. Edit pages show "N files didn't upload — add them below" when some uploads failed after the
   create (each failure is also toasted and recorded, as today).

Out of scope: Edit video page layout, Add/Edit download pages, Team photos, public pages, database
schema, the photo encoder, storage rules, mobile-specific redesign (layouts stack below `xl`).

## Architecture context

- Create actions (`createListingAction`, `createConnectionAction`, `createHomeworkVideoAction`)
  currently `redirect()` on the server. Uploads need the new record's id (upload tickets check the
  record exists; storage folders are `<kind>/<recordId>/…`). Change: these three return
  `getCreatedState(message, id)` (new `createdId` on `ActionState`), and the client uploads, then
  `router.push(editHref)`. Idempotency (`runOnce`) is unchanged, so a retried save returns the same id.
- `useAdminForm` remounts fields after each success (`savedVersion`). Create forms key the field
  Fragment only in edit mode so typed values stay on screen while uploads run.
- Photos: `usePhotoUpload` (encode in browser → ticket → PUT files) is split so a plain async
  `uploadPhotoFile({ target, file, onShare })` exists for a record id known only after create; the
  hook keeps its behavior by calling it.
- Homework: `useHomeworkUpload` binds `itemId` at hook creation; export the existing
  `fetchUploadWithCover` as `uploadHomeworkFile(steps)` for the create flow; hook unchanged.
- Order of new listing photos: `addListingPhotoAction` inserts `sort_order = 9999`; ties sort by
  random uuid, so a batch would land in random order. Change to `max(sort_order) + 1` for the listing
  (non-deleted), or 1 when it has none. `move_item` renumbers
  1..n by (sort_order, id) so this stays consistent.
- Drag reorder: `moveListingPhotoAction({ photoId, steps })` now takes a number of places (±1 for
  Earlier / Later, more for a drag) and runs the existing `move_item` RPC |steps| times in one server
  call (each step is its own transaction; no migration). It keeps its catalog entry
  `listings.move_photo`; CI requires one entry per action, and a new entry would need a migration.
- CSP: admin pages allow `blob:` images and media (local previews); no inline `style` attributes
  (strict CSP) — Tailwind classes only.

## Task breakdown

1. `src/lib/admin/action-state.ts`: add `createdId?: string` + `getCreatedState(message, createdId)`.
2. Server actions:
   - `src/lib/admin/listings/actions.ts`: create returns `getCreatedState`; `addListingPhotoAction`
     appends after the last photo; add `moveListingPhotoToAction`.
   - `src/lib/admin/connections/actions.ts`: create returns `getCreatedState` (keeps refresh).
   - `src/lib/admin/homework/actions.ts`: `createHomeworkVideoAction` returns `getCreatedState`.
   - Problems from the drag action are recorded under the existing `listings.move_photo`.
3. Upload helpers:
   - `src/components/admin/photos/use-photo-upload.ts`: extract `uploadPhotoFile`.
   - `src/components/admin/homework/use-homework-upload.ts`: export `uploadHomeworkFile`.
4. Shared UI (new, `src/components/admin/`):
   - `admin-field-row.tsx` — side-by-side fields from `md`.
   - `uploads/file-drop-zone.tsx` — labelled file input + drag-and-drop target.
   - `uploads/pending-photos.tsx` — queue of chosen photos (thumbnail, description, move, remove,
     drag) + `validatePendingPhotos`.
   - `uploads/use-create-with-uploads.ts` — after a create succeeds: run uploads with a status
     line, toast failures, push to `editHref?created=1[&missed=N]`.
   - `uploads/created-href.ts` (+ unit test) — builds that href.
5. Listing: `listing-form.tsx` (rows; create mode two columns + Photos panel + upload on save),
   `listing-photos.tsx` (grid, drag, blur-save, Add photos queue), `listing-publishing.tsx` (strip),
   `app/admin/(portal)/listings/new/page.tsx` (lead text), `[id]/page.tsx` (missed message,
   section layout).
6. Connection: `connection-form.tsx` (edit details), new `connection-fields.tsx`,
   `connection-preview.tsx`, `connection-editor.tsx` (Edit page two columns; the photo panel sits
   outside the details form because it has its own buttons), `new-connection-form.tsx`,
   `new/page.tsx`, `[id]/page.tsx`. `connection-photo.tsx` already fits the right column unchanged.
7. Video: `video-details-form.tsx` (create mode two columns: video, cover, captions; upload on
   save), `new-video/page.tsx` (lead text), `homework/[id]/page.tsx` (created message now says it's
   uploaded; missed message).
8. Tests: unit test for `getCreatedHref`; update e2e specs `listings`, `connections`, `homework`
   for the new flow (photo on the Add page; video on the Add page) and add a drag-free reorder check
   via Move earlier.
9. Verify: `npm run typecheck`, `npm run lint`, `npm test`, e2e admin specs against the local DB,
   then reload real content (memory rule), screenshots at 1440px.

## Assumptions

- Two columns start at `xl` (1280px). With the 256px sidebar, 1440px leaves ~660px for fields.
- Uploads after create run one at a time (photo encoding is heavy).
- A video file is required on the Add video page (client check). The server still accepts details
  alone, so the Edit page flow is unchanged.
- If an upload fails after create, the record stays (draft / hidden) and the Edit page explains what
  to add; no rollback.
- Description stays required for every photo (Admin §2).

## DO NOT TOUCH

- `supabase/migrations/**` (no schema change), `cwr.move_item`.
- `src/lib/admin/photos/actions.ts`, `photo-storage.ts`, `encode-photo.ts`, `src/workers/**`.
- `src/lib/admin/homework/upload-actions.ts`, `make-video-cover.ts`, `upload-problems.ts`.
- Public site pages and components (`app/(site)/**`, `src/components/content/**`).
- `createHomeworkDownloadAction` and the download pages; Team pages; `AdminFieldset`, `AdminField`,
  `SaveBar`, `useAdminForm` contract (only callers change).
- Content security policy.

## Downstream Impact Analysis

### Level 1 — Direct
Files: listed in the task breakdown.
Functions/contracts: `ActionState` (new optional field), three create actions (redirect → created
state), `addListingPhotoAction` (sort order), `usePhotoUpload` / `useHomeworkUpload` (extracted
functions, same hook API), new `moveListingPhotoToAction`.

### Level 2 — Dependent
Files: every `useAdminForm` caller (only reads `status`, `message`, `fieldErrors` — new optional
field ignored); `PhotoPicker`, `HomeworkFileUpload` (hook API unchanged); problem catalog test
(new entry must have a matching `fn`); e2e specs that create items and expected a redirect.
Risk: low — e2e specs updated in step 8.

### Level 3 — Cascading
Files: public listing page photo order (reads `sort_order`; appended photos now keep pick order —
improvement); Problems page labels (new catalog entry).
Risk: none.

## Build notes (2026-10-10)

- The theme defined only `md` and `lg` breakpoints. Added a `desktop` (1280px) breakpoint and an
  `admin-side` (384px) size token; not `xl`, which would wake dormant `xl:` classes on public pages
  (flagged separately). The design-token check forbids raw sizes like `min-[1280px]:`.
- Create actions reply "Saved."; the Edit page banner carries the full message, so it isn't shown twice.
- Photos queued on the Edit page are labelled "new photo N" so they never share a name with saved photos.
- Verified: typecheck, lint, 957 unit tests, 102 admin e2e tests (incl. drag reorder), screenshots at 1440px.
