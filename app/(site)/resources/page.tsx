import { Download, ExternalLink, FileText, Play, Presentation, type LucideIcon } from "lucide-react";

import type { Metadata } from "next";

import { ButtonLink, getButtonClassName } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { getPhotoSources } from "@/lib/content/media";
import { fetchHomework, type DownloadIcon, type HomeworkContent, type HomeworkDownload, type HomeworkVideo } from "@/lib/content/homework";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH } from "@/lib/site/contact-links";

// Homework (FAQs & Homework) from Admin → Homework: embedded videos and grouped downloads,
// like the old site's page (owner-approved design 2026-09-27, docs/cwr-site-review-round-plan.md Round 2).

export const metadata: Metadata = {
  title: "FAQs & Homework",
  description: "Short videos and guides for buying and selling a home in the Triad, from Charlie Ward Realty.",
};

const SPANISH = "es";
const DOWNLOAD_ICONS: Record<DownloadIcon, LucideIcon> = { document: FileText, presentation: Presentation, link: ExternalLink };

// A database problem must not blank the page: it shows the question box instead (Infra §3).
async function fetchHomeworkOrEmpty(): Promise<HomeworkContent> {
  try {
    return await fetchHomework();
  } catch (error) {
    console.error("Homework unavailable", error);
    return { videos: [], groups: [] };
  }
}

function getPosterSource(video: HomeworkVideo): string | undefined {
  if (!video.cover) return undefined;
  return getPhotoSources({ folder: video.cover.folder, originalWidth: video.cover.width })?.fallbackSrc;
}

function VideoCard({ video }: { video: HomeworkVideo }) {
  return (
    <li lang={video.isSpanish ? SPANISH : undefined} className="border-t-2 border-ink pt-6">
      <video
        controls
        preload="none"
        playsInline
        crossOrigin={video.captionsUrl ? "anonymous" : undefined}
        poster={getPosterSource(video)}
        aria-label={`${video.title} video`}
        className="block aspect-video w-full bg-photo-placeholder-dark object-cover"
      >
        <source src={video.videoUrl} type="video/mp4" />
        {video.captionsUrl && <track kind="captions" src={video.captionsUrl} srcLang={video.isSpanish ? SPANISH : "en"} label={video.isSpanish ? "Español" : "English"} default />}
      </video>
      <h3 className="type-h3 mt-4">{video.title}</h3>
      {video.lengthLabel && (
        <p className="type-small mt-1 flex items-center gap-2 font-semibold text-muted">
          <Play aria-hidden size={ICON_SIZE.inline} />
          {`Video · ${video.lengthLabel}`}
        </p>
      )}
      {video.description && <p className="mt-2">{video.description}</p>}
    </li>
  );
}

function DownloadRow({ download }: { download: HomeworkDownload }) {
  const Icon = DOWNLOAD_ICONS[download.icon];
  const ButtonIcon = download.icon === "link" ? ExternalLink : Download;
  return (
    <li lang={download.isSpanish ? SPANISH : undefined} className="grid grid-cols-[auto_1fr] items-start gap-4 border-b border-line py-6 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-6">
      <span aria-hidden className="flex size-12 items-center justify-center border border-field-border bg-surface">
        <Icon size={ICON_SIZE.message} />
      </span>
      <div>
        <h4 className="text-lg leading-label font-bold">{download.title}</h4>
        {download.description && <p className="mt-1">{download.description}</p>}
        <p className="type-small mt-1 font-semibold text-muted">{download.detailLabel}</p>
      </div>
      <a href={download.href} className={`${getButtonClassName({ size: "m", variant: "secondary" })} col-span-2 md:col-span-1`}>
        <ButtonIcon aria-hidden size={ICON_SIZE.button} />
        {download.buttonLabel}
        <span className="sr-only">{`: ${download.title}`}</span>
      </a>
    </li>
  );
}

function VideoSection({ videos }: { videos: HomeworkVideo[] }) {
  if (videos.length === 0) return null;
  return (
    <Section labelledBy="videos-heading">
      <Eyebrow>Watch</Eyebrow>
      <h2 id="videos-heading" className="type-h2">Videos</h2>
      <ul className="mt-6 grid gap-8 md:mt-10 lg:grid-cols-2">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </ul>
    </Section>
  );
}

function GuideSection({ groups }: { groups: HomeworkContent["groups"] }) {
  if (groups.length === 0) return null;
  return (
    <Section tone="soft" labelledBy="guides-heading">
      <Eyebrow>Download</Eyebrow>
      <h2 id="guides-heading" className="type-h2">Guides to read and keep</h2>
      <p className="type-lead mt-4 max-w-prose">Each guide opens on your phone or computer. Print it, share it, or bring it to your first meeting with us.</p>
      {groups.map((group) => (
        <div key={group.key} lang={group.key === "spanish" ? SPANISH : undefined} className="mt-10">
          <h3 className="type-h3 mb-2">{group.label}</h3>
          <ul className="border-t-2 border-ink">
            {group.downloads.map((download) => (
              <DownloadRow key={download.id} download={download} />
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

function UpdatingNotice() {
  return (
    <Section labelledBy="updating-heading">
      <h2 id="updating-heading" className="type-h3">Our videos and guides are being updated</h2>
      <p className="mt-2 max-w-prose">Check back soon, or ask us below and we&apos;ll send you the guide you need.</p>
    </Section>
  );
}

function QuestionBox() {
  return (
    <Section labelledBy="question-heading">
      <div className="flex flex-col gap-6 border-t-2 border-ink bg-surface-soft p-6 md:flex-row md:items-center md:justify-between md:p-10">
        <div>
          <h2 id="question-heading" className="type-h3">Have a question these don&apos;t answer?</h2>
          <p className="mt-2 max-w-prose">Ask us. A real person on our team will get back to you.</p>
        </div>
        <ButtonLink href={CONTACT_PAGE_PATH} size="m" variant="main" isFullWidthOnMobile>
          Ask us a question
        </ButtonLink>
      </div>
    </Section>
  );
}

export default async function ResourcesPage() {
  const { videos, groups } = await fetchHomeworkOrEmpty();
  return (
    <>
      <PageIntro
        eyebrow="FAQs & Homework"
        title="Homework"
        lead="Short videos and guides that answer the questions buyers and sellers ask us most. Watch online, or download a guide to read later."
      />
      {videos.length === 0 && groups.length === 0 && <UpdatingNotice />}
      <VideoSection videos={videos} />
      <GuideSection groups={groups} />
      <QuestionBox />
    </>
  );
}
