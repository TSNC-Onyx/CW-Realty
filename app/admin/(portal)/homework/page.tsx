import { GraduationCap, Plus } from "lucide-react";
import type { Metadata } from "next";

import { HomeworkList, type HomeworkListItem } from "@/components/admin/homework/homework-list";
import { LoadProblem } from "@/components/admin/load-problem";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/text-link";
import { getItemCover, getItemDetail } from "@/lib/admin/homework/item-labels";
import { fetchAdminHomework, type AdminHomeworkItem } from "@/lib/admin/homework/queries";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { HOMEWORK_GROUPS } from "@/lib/content/homework-rules";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const metadata: Metadata = { title: "Homework" };

function getListItem(item: AdminHomeworkItem): HomeworkListItem {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    detail: getItemDetail(item),
    isVisible: item.is_visible,
    needsCaptions: item.kind === "video" && item.file_path !== null && item.captions_path === null,
    cover: getItemCover(item),
  };
}

function PageHeader() {
  return (
    <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="type-h1 mb-2">Homework</h1>
        <p className="type-lead text-muted">Videos and guides on the Homework page. The order here is the order visitors see.</p>
        <TextLink href="/resources" hasArrow>View the Homework page</TextLink>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/admin/homework/new-video" size="m" variant="main">
          <Plus aria-hidden size={ICON_SIZE.button} />
          Add video
        </ButtonLink>
        <ButtonLink href="/admin/homework/new-download" size="m" variant="secondary">
          <Plus aria-hidden size={ICON_SIZE.button} />
          Add download or link
        </ButtonLink>
      </div>
    </div>
  );
}

export default async function AdminHomeworkPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const homework = await fetchAdminHomework(admin);
  const notice = await reportPageLoad({ admin, action: "homework.load", results: [homework] });
  if (!homework.isLoaded) {
    return (
      <>
        <PageHeader />
        <LoadProblem notice={notice} />
      </>
    );
  }
  const items = homework.data;
  if (items.length === 0) {
    return (
      <>
        <PageHeader />
        <EmptyState
          icon={GraduationCap}
          titleId="homework-empty"
          title="No videos or guides yet"
          description="Add the videos and guides buyers and sellers can watch or download from the Homework page."
          action={<ButtonLink href="/admin/homework/new-video" size="m" variant="main">Add video</ButtonLink>}
        />
      </>
    );
  }
  const videos = items.filter((item) => item.kind === "video");
  const groups = HOMEWORK_GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.group_key === group.key) })).filter((group) => group.items.length > 0);
  return (
    <>
      <PageHeader />
      <section aria-labelledby="homework-videos-heading">
        <h2 id="homework-videos-heading" className="type-h2-article mb-4">Videos</h2>
        {videos.length > 0 ? <HomeworkList items={videos.map(getListItem)} /> : <p className="text-muted">No videos yet.</p>}
      </section>
      <section aria-labelledby="homework-downloads-heading" className="mt-14">
        <h2 id="homework-downloads-heading" className="type-h2-article">Downloads and links</h2>
        <p className="mt-1 text-base text-muted">Grouped as on the Homework page. Move items up or down within their group.</p>
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`homework-group-${group.key}`} className="mt-8">
            <h3 id={`homework-group-${group.key}`} className="type-eyebrow mb-3 flex items-center gap-3">
              <span aria-hidden className="h-0.5 w-8 bg-ink" />
              {group.label}
            </h3>
            <HomeworkList items={group.items.map(getListItem)} />
          </section>
        ))}
      </section>
    </>
  );
}
