import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { DownloadDetailsForm } from "@/components/admin/homework/download-details-form";
import { CaptionsPanel, CoverPanel, DocumentFilePanel, VideoFilePanel, type StoredFile } from "@/components/admin/homework/homework-file-panels";
import { VideoDetailsForm } from "@/components/admin/homework/video-details-form";
import { Message } from "@/components/ui/message";
import { TextLink } from "@/components/ui/text-link";
import { getItemCover, getStoredFileDetail } from "@/lib/admin/homework/item-labels";
import { fetchAdminHomeworkItem, type AdminHomeworkItem } from "@/lib/admin/homework/queries";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Edit Homework item" };

type EditHomeworkPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };

function getStoredFile(item: AdminHomeworkItem): StoredFile | null {
  const detail = getStoredFileDetail(item);
  return item.file_name && detail ? { name: item.file_name, detail } : null;
}

function VideoSections({ item }: { item: AdminHomeworkItem }) {
  return (
    <div className="grid gap-12">
      <VideoFilePanel itemId={item.id} file={getStoredFile(item)} />
      <CoverPanel itemId={item.id} title={item.title} cover={getItemCover(item)} />
      <CaptionsPanel itemId={item.id} title={item.title} hasCaptions={item.captions_path !== null} />
      <VideoDetailsForm mode="edit" itemId={item.id} defaults={{ title: item.title, description: item.description, isSpanish: item.is_spanish, isVisible: item.is_visible }} />
    </div>
  );
}

function DownloadSections({ item }: { item: AdminHomeworkItem }) {
  const delivery = item.kind === "link" ? "link" : "file";
  return (
    <div className="grid gap-12">
      {delivery === "file" && <DocumentFilePanel itemId={item.id} file={getStoredFile(item)} />}
      <DownloadDetailsForm
        mode="edit"
        itemId={item.id}
        defaults={{
          delivery,
          groupKey: item.group_key ?? "buyers",
          title: item.title,
          description: item.description,
          linkUrl: item.link_url ?? "",
          isSpanish: item.is_spanish,
          isVisible: item.is_visible,
        }}
      />
    </div>
  );
}

function getCreatedMessage(item: AdminHomeworkItem): string {
  if (item.kind === "video") return "Upload the video below. It shows on the Homework page once uploaded.";
  if (item.kind === "file") return "Upload the file below. It shows on the Homework page once uploaded.";
  return "The link is saved. Change anything below, or go back to the list.";
}

export default async function EditHomeworkItemPage({ params, searchParams }: EditHomeworkPageProps) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const admin = await requireAdminPage(EDITOR_ROLES);
  const parsedId = z.uuid().safeParse(id);
  const item = parsedId.success ? await fetchAdminHomeworkItem(admin, parsedId.data) : null;
  if (!item) notFound();
  return (
    <>
      <TextLink href="/admin/homework">Back to Homework</TextLink>
      <h1 className="type-h1 mt-4 mb-2">{item.title}</h1>
      <div className="mb-10">
        <TextLink href="/resources" hasArrow>View on the Homework page</TextLink>
      </div>
      {created && (
        <div className="mb-8 max-w-prose">
          <Message tone="success" title={item.kind === "video" ? "Video added" : "Item added"}>
            <p>{getCreatedMessage(item)}</p>
          </Message>
        </div>
      )}
      {item.kind === "video" ? <VideoSections item={item} /> : <DownloadSections item={item} />}
    </>
  );
}
