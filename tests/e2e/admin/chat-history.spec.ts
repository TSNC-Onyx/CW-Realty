import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { VIEWPORTS } from "../pages";
import { HAS_ADMIN_DATABASE, createTestAdmin, getServiceClient, signInFully, type TestAdmin } from "./admin-helpers";

// Chat history search, sort, and activity figures (owner request 2026-10-22). Each test seeds
// its own chats with a unique word and looks only at those, so other chats in the database
// never change the result.

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

const MINUTE_MS = 60 * 1000;

type Exchange = { question: string; reply: string; isHandoff?: boolean };
type SeedChat = { exchanges: Exchange[]; minutesAgo: number };

let owner: TestAdmin;
let tenantId: string;

test.beforeAll(async () => {
  owner = await createTestAdmin("owner");
  const { data } = await getServiceClient().from("tenants").select("id").eq("slug", "cwr").single();
  tenantId = data?.id;
});

function getToken(): string {
  return `zq${randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

/** Saves a chat the way the website does: each question and its reply in one insert. */
async function seedChat({ exchanges, minutesAgo }: SeedChat): Promise<string> {
  const client = getServiceClient();
  const startedAt = new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString();
  const { data: session, error } = await client.from("chat_sessions").insert({ tenant_id: tenantId, started_at: startedAt }).select("id").single();
  if (error) throw new Error(`Could not seed a chat: ${error.message}`);
  for (const exchange of exchanges) {
    const rows = [
      { tenant_id: tenantId, session_id: session.id, role: "visitor", body: exchange.question, cited_sections: [], outcome: null, source: "typed" },
      { tenant_id: tenantId, session_id: session.id, role: "assistant", body: exchange.reply, cited_sections: [], outcome: exchange.isHandoff ? "handoff" : "answer", source: "typed" },
    ];
    const { error: messageError } = await client.from("chat_messages").insert(rows);
    if (messageError) throw new Error(`Could not seed a message: ${messageError.message}`);
  }
  return session.id;
}

async function countChatLoadProblems(since: string): Promise<number> {
  const { count, error } = await getServiceClient().from("problem_events").select("id", { count: "exact", head: true }).eq("action", "chats.load").gte("occurred_at", since);
  if (error) throw new Error(`Could not read problems: ${error.message}`);
  return count ?? 0;
}

function getChatLinks(page: Page) {
  return page.getByRole("list").filter({ has: page.locator('a[href^="/admin/chats/"]') }).getByRole("link");
}

async function getChatOrder(page: Page, labels: string[]): Promise<string[]> {
  const texts = await getChatLinks(page).allInnerTexts();
  return texts.flatMap((text) => labels.filter((label) => text.includes(label)));
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await signInFully(page, owner);
});

test("the list still opens newest first, with each chat's question count and hand-offs", async ({ page }) => {
  // Arrange
  const token = getToken();
  await seedChat({ minutesAgo: 2, exchanges: [{ question: `older ${token}`, reply: "Sure." }] });
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `newer ${token}`, reply: "Sure." }, { question: "And rentals?", reply: "A person will help.", isHandoff: true }] });

  // Act
  await page.goto(`/admin/chats?q=${token}`);

  // Assert
  expect(await getChatOrder(page, [`newer ${token}`, `older ${token}`])).toEqual([`newer ${token}`, `older ${token}`]);
  await expect(getChatLinks(page).filter({ hasText: `newer ${token}` })).toContainText("2 questions · 1 not answered");
});

test("search finds a word in the assistant's reply, ignoring capitals, as you type", async ({ page }) => {
  // Arrange
  const token = getToken();
  await seedChat({ minutesAgo: 1, exchanges: [{ question: "Do you manage rentals?", reply: `Yes, our ${token} program does.` }] });
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `Unrelated ${getToken()}`, reply: "Sure." }] });
  await page.goto("/admin/chats");

  // Act
  await page.getByRole("searchbox", { name: "Search chats" }).fill(token.toUpperCase());

  // Assert
  await expect(page).toHaveURL(new RegExp(`q=${token.toUpperCase()}`));
  await expect(getChatLinks(page)).toHaveCount(1);
  await expect(getChatLinks(page)).toContainText("Do you manage rentals?");
});

test("typing slowly keeps every letter, even when the list updates mid-word", async ({ page }) => {
  // Arrange
  const token = getToken();
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `Question ${token}`, reply: "Sure." }] });
  await page.goto("/admin/chats");
  const searchBox = page.getByRole("searchbox", { name: "Search chats" });

  // Act
  await searchBox.pressSequentially(token, { delay: 350 });

  // Assert
  await expect(searchBox).toHaveValue(token);
  await expect(page).toHaveURL(new RegExp(`q=${token}$`));
  await expect(getChatLinks(page)).toHaveCount(1);
});

test("the search box keeps its width when the first letter is typed, so nothing shifts", async ({ page }) => {
  // Arrange
  await page.goto("/admin/chats");
  const searchBox = page.getByRole("searchbox", { name: "Search chats" });
  const getPagePosition = () => searchBox.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top + window.scrollY, left: box.left, width: box.width, height: box.height };
  });
  await searchBox.focus();
  const before = await getPagePosition();

  // Act
  await searchBox.pressSequentially("a");
  const after = await getPagePosition();

  // Assert
  expect(after).toEqual(before);
});

test("clearing the search shows every chat again", async ({ page }) => {
  // Arrange
  const token = getToken();
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `Question ${token}`, reply: "Sure." }] });
  await page.goto(`/admin/chats?q=${token}`);

  // Act
  await page.getByRole("button", { name: "Clear" }).click();

  // Assert
  await expect(page).toHaveURL(/\/admin\/chats$/);
  await expect(page.getByRole("searchbox", { name: "Search chats" })).toHaveValue("");
});

test("a search with symbols finds the chat that contains them, and nothing else", async ({ page }) => {
  // Arrange
  const token = getToken();
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `Is it 50%_off ${token}?`, reply: "Sure." }] });
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `Is it 50 percent off ${token}?`, reply: "Sure." }] });
  await page.goto("/admin/chats");

  // Act
  await page.getByRole("searchbox", { name: "Search chats" }).fill(`50%_off ${token}`);

  // Assert
  await expect(getChatLinks(page)).toHaveCount(1);
  await expect(getChatLinks(page)).toContainText("50%_off");
});

test("odd searches and a page past the end never break the page or log a problem", async ({ page }) => {
  // Arrange
  const since = new Date().toISOString();
  const oddSearches = [`"(x)", 'y' \\ *`, "%", "_", "a,b.c:d", "é 中文 🙂", "x".repeat(150)];

  // Act
  for (const search of oddSearches) {
    await page.goto(`/admin/chats?q=${encodeURIComponent(search)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Chat history" })).toBeVisible();
  }
  await page.goto("/admin/chats?q=zzznomatchzzz&page=9999");

  // Assert
  await expect(page).toHaveURL(/q=zzznomatchzzz$/);
  await expect(page.getByRole("heading", { name: "No chats match your search" })).toBeVisible();
  expect(await countChatLoadProblems(since)).toBe(0);
});

test("clicking a heading sorts by it, and clicking again reverses it", async ({ page }) => {
  // Arrange
  const token = getToken();
  const exchange = (question: string) => ({ question, reply: "Sure." });
  await seedChat({ minutesAgo: 3, exchanges: [exchange(`Banana ${token}`)] });
  await seedChat({ minutesAgo: 2, exchanges: [exchange(`cherry ${token}`), exchange("two"), exchange("three")] });
  await seedChat({ minutesAgo: 1, exchanges: [exchange(`Apple ${token}`), exchange("two")] });
  const labels = [`Apple ${token}`, `Banana ${token}`, `cherry ${token}`];
  await page.goto(`/admin/chats?q=${token}`);
  const sortNav = page.getByRole("navigation", { name: "Sort chats" });

  // Act
  await sortNav.getByRole("link", { name: "Details", exact: true }).click();
  await expect(page).toHaveURL(/sort=details/);
  const mostFirst = await getChatOrder(page, labels);
  await sortNav.getByRole("link", { name: /Details/ }).click();
  await expect(page).toHaveURL(/dir=asc/);
  const fewestFirst = await getChatOrder(page, labels);
  await sortNav.getByRole("link", { name: "Question", exact: true }).click();
  await expect(page).toHaveURL(/sort=question/);
  const aToZ = await getChatOrder(page, labels);

  // Assert
  expect([mostFirst, fewestFirst, aToZ]).toEqual([
    [`cherry ${token}`, `Apple ${token}`, `Banana ${token}`],
    [`Banana ${token}`, `Apple ${token}`, `cherry ${token}`],
    [`Apple ${token}`, `Banana ${token}`, `cherry ${token}`],
  ]);
});

test("sorting doesn't scroll the page back to the top", async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 1440, height: 500 });
  const token = getToken();
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `Question ${token}`, reply: "Sure." }] });
  await page.goto(`/admin/chats?q=${token}`);
  const sortLink = page.getByRole("navigation", { name: "Sort chats" }).getByRole("link", { name: "Details", exact: true });
  await sortLink.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);

  // Act
  await sortLink.click();
  await expect(page).toHaveURL(/sort=details/);

  // Assert
  expect(scrollBefore).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test("on a phone a Sort by menu replaces the headings", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.phone);
  const token = getToken();
  await seedChat({ minutesAgo: 2, exchanges: [{ question: `older ${token}`, reply: "Sure." }] });
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `newer ${token}`, reply: "Sure." }] });
  await page.goto(`/admin/chats?q=${token}`);
  const menu = page.getByRole("combobox", { name: "Sort by" });

  // Act
  await menu.selectOption({ label: "Oldest first" });
  await expect(page).toHaveURL(/dir=asc/);

  // Assert
  await expect(page.getByRole("navigation", { name: "Sort chats" })).toBeHidden();
  await expect(menu.getByRole("option")).toHaveCount(6);
  expect(await getChatOrder(page, [`older ${token}`, `newer ${token}`])).toEqual([`older ${token}`, `newer ${token}`]);
});

test("Couldn't answer and search work together", async ({ page }) => {
  // Arrange
  const token = getToken();
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `handed off ${token}`, reply: "A person will help.", isHandoff: true }] });
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `answered ${token}`, reply: "Sure." }] });
  await page.goto(`/admin/chats?q=${token}`);

  // Act
  await page.getByRole("link", { name: "Couldn't answer" }).click();

  // Assert
  await expect(page).toHaveURL(new RegExp(`show=handoffs&q=${token}`));
  await expect(getChatLinks(page)).toHaveCount(1);
  await expect(getChatLinks(page)).toContainText(`handed off ${token}`);
});

test("the activity span switch keeps the search and sort, and shows three figures", async ({ page }) => {
  // Arrange
  const token = getToken();
  await seedChat({ minutesAgo: 1, exchanges: [{ question: `Question ${token}`, reply: "Sure." }] });
  await page.goto(`/admin/chats?q=${token}&sort=details`);
  const activity = page.getByRole("region", { name: "Activity" });

  // Act
  await activity.getByRole("link", { name: "30 days" }).click();

  // Assert
  await expect(page).toHaveURL(new RegExp(`q=${token}&sort=details&span=30`));
  await expect(activity.getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "page");
  await expect(activity.getByRole("list").last().getByRole("listitem")).toHaveText([/Chats.*previous 30 days/s, /Answered rate/, /Sent to the inbox.*previous 30 days/s]);
  await expect(activity.getByText("Didn't load")).toHaveCount(0);
});
