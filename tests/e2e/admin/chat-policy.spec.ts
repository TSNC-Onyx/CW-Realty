import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { BUILT_IN_TEST_CASES, SAFETY_CHECKS_VERSION } from "../../../src/lib/admin/chat-policy/test-verdict";
import { HANDOFF_TEXT } from "../../../src/lib/chat/handoff-text";
import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully, waitForBotCheck, type TestAdmin } from "./admin-helpers";

// Phase 5: owner-only chatbot policy (Admin §6) and the chat history review (Features §2).
// Serial: every test shares the one CWR policy history.

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");
test.describe.configure({ mode: "serial" });

const POLICY_PATH = "/admin/chat-policy";

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type RecordedResult = {
  question: string;
  expectedOutcome: "answer" | "handoff";
  expectedSection: string | null;
  isBuiltIn: boolean;
  outcome: "answer" | "handoff" | null;
  reply: string;
  citedSections: string[];
  isPassed: boolean;
  isApprovedWording?: boolean;
  checksVersion?: string;
};

/** The built-in safety checks, passed with the approved wording; no version stands for a run from before the checks changed. */
function getBuiltInResults(checksVersion: string | null = SAFETY_CHECKS_VERSION): RecordedResult[] {
  return BUILT_IN_TEST_CASES.map((testCase) => ({ ...testCase, outcome: "handoff", reply: HANDOFF_TEXT.needsPerson, citedSections: [], isPassed: true, isApprovedWording: true, ...(checksVersion ? { checksVersion } : {}) }));
}

/** Stands in for a test run, which needs the Anthropic key CI does not have. */
async function recordRun({ isPassed, results }: { isPassed: boolean; results: RecordedResult[] }): Promise<void> {
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const { data: draft } = await client.from("chat_policies").select("id, updated_at").eq("tenant_id", tenant?.id).eq("status", "draft").order("version", { ascending: false }).limit(1).single();
  const { data: newestTest } = await client.from("chat_policy_tests").select("updated_at").eq("tenant_id", tenant?.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = await client.rpc("record_chat_policy_test_run", { p_policy_id: draft?.id, p_policy_updated_at: draft?.updated_at, p_tests_updated_at: newestTest?.updated_at ?? null, p_is_passed: isPassed, p_results: results, p_ran_by: null });
  if (error) throw new Error(`Could not record a test run: ${error.message}`);
}

async function recordPassingRun(): Promise<void> {
  await recordRun({ isPassed: true, results: getBuiltInResults() });
}

/** The add form starts open when there are no questions yet, so it is opened only when closed. */
async function openAddQuestionForm(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Add a test question" });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function saveDraft(page: Page, body: string): Promise<void> {
  await page.getByLabel("Policy text").fill(body);
  await page.getByRole("button", { name: "Save draft" }).click();
}

let owner: TestAdmin;

test.beforeAll(async () => {
  owner = await createTestAdmin("owner");
});

test("managers cannot open the chatbot policy but can read chat history", async ({ page }) => {
  // Arrange
  const manager = await createTestAdmin("manager");
  await signInFully(page, manager);

  // Act
  await page.goto(POLICY_PATH);

  // Assert
  await expect(page.getByText("That area isn't part of your role")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Chatbot policy" })).toHaveCount(0);
  await page.goto("/admin/chats");
  await expect(page.getByRole("heading", { level: 1, name: "Chat history" })).toBeVisible();
});

test("a policy without a section heading is not saved", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);

  // Act
  await saveDraft(page, "We are open weekdays.");

  // Assert
  await expect(page.locator("#policy-body-error")).toContainText("Add at least one section heading");
});

test("the owner saves a draft, and publishing waits for a passing test run", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);

  // Act
  await saveDraft(page, "# Office hours\nWe are open weekdays from 9 to 5.");

  // Assert
  await expect(page.getByRole("status").filter({ hasText: /draft version \d+/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Publish this draft to the website chat" })).toBeDisabled();
});

test("running the tests explains that the assistant is not connected yet", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await openAddQuestionForm(page);
  await page.getByLabel("Question a visitor might ask").fill("When are you open?");
  await page.getByLabel("Section it should cite").selectOption("Office hours");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Test question added." })).toBeVisible();

  // Act
  await page.getByRole("button", { name: "Run the tests on the saved draft" }).click();

  // Assert
  await expect(page.getByRole("alert").filter({ hasText: /isn't connected yet/ })).toBeVisible();
});

test("more than five test questions scroll inside their own box, which the keyboard can reach", async ({ page }) => {
  // Arrange
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const rows = Array.from({ length: 6 }, (_unused, index) => ({ tenant_id: tenant?.id, question: `Scroll box question ${index + 1} ${Date.now()}`, expected_outcome: "handoff" }));
  const { data: added } = await client.from("chat_policy_tests").insert(rows).select("id");
  await signInFully(page, owner);

  // Act
  await page.goto(POLICY_PATH);
  const box = page.getByRole("region", { name: /^Test questions, \d+ in all$/ });
  await box.focus();
  const results = await new AxeBuilder({ page }).include(".policy-test-scroll").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const isScrollable = await box.evaluate((element) => element.scrollHeight > element.clientHeight);
  await client.from("chat_policy_tests").delete().in("id", (added ?? []).map((row) => row.id));

  // Assert
  expect({ isFocused: await box.evaluate((element) => element === document.activeElement), isScrollable, violations: results.violations }).toEqual({ isFocused: true, isScrollable: true, violations: [] });
});

test("after a failed run the list opens on the failed question, with its reply and the reason Publish is locked", async ({ page }) => {
  // Arrange
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const question = `Failing question ${Date.now()}`;
  const { data: added } = await client.from("chat_policy_tests").insert({ tenant_id: tenant?.id, question, expected_outcome: "answer", expected_section: null }).select("id").single();
  // Without an Anthropic key (CI) the reason names that first, as the page's priority order says.
  await recordRun({ isPassed: false, results: [...getBuiltInResults(), { question, expectedOutcome: "answer", expectedSection: null, isBuiltIn: false, outcome: "handoff", reply: "A person on our team can help with that.", citedSections: [], isPassed: false }] });
  await signInFully(page, owner);

  // Act
  await page.goto(POLICY_PATH);
  const isFailedPressed = await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Failed 1$/ }).getAttribute("aria-pressed");
  const results = await new AxeBuilder({ page }).include('section[aria-labelledby="publish-heading"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const isReplyShown = await page.getByText("A person on our team can help with that.").isVisible();
  const reason = await page.getByText(/^Publish is locked: /).textContent();
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All \d+$/ }).click();
  const isAllPressed = await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All \d+$/ }).getAttribute("aria-pressed");
  await client.from("chat_policy_tests").delete().eq("id", added?.id);

  // Assert
  expect({ isFailedPressed, isReplyShown, reason, isAllPressed, violations: results.violations }).toEqual({ isFailedPressed: "true", isReplyShown: true, reason: expect.stringMatching(/^Publish is locked: (1 question needs your attention\.|The chat assistant isn't connected yet)/), isAllPressed: "true", violations: [] });
});

test("the section list offers only sections the assistant may cite, and an older question citing a private one is flagged", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await saveDraft(page, "# Office hours\nWe are open weekdays.\n# Margins (private)\nInternal notes.");
  await expect(page.getByRole("status").filter({ hasText: /draft version \d+/i })).toBeVisible();
  const question = `Private section question ${Date.now()}`;
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  await client.from("chat_policy_tests").insert({ tenant_id: tenant?.id, question, expected_outcome: "answer", expected_section: "Margins (private)" });
  await page.reload();
  await openAddQuestionForm(page);

  // Act
  const sectionOptions = await page.getByLabel("Section it should cite").locator("option").allTextContents();
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All \d+$/ }).click();
  const isRowWarned = await page.getByRole("listitem").filter({ hasText: question }).getByText("Cites a private section, so this test can’t pass.").isVisible();
  await client.from("chat_policy_tests").delete().eq("question", question);

  // Assert
  expect({ sectionOptions, isRowWarned }).toEqual({ sectionOptions: ["Any section", "Office hours"], isRowWarned: true });
});

test("a failed question explains why and offers a one-click fix with Undo", async ({ page }) => {
  // Arrange
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const question = `Am I talking to a real person? ${Date.now()}`;
  const { data: added } = await client.from("chat_policy_tests").insert({ tenant_id: tenant?.id, question, expected_outcome: "answer", expected_section: "Office hours" }).select("id").single();
  await recordRun({ isPassed: false, results: [...getBuiltInResults(), { question, expectedOutcome: "answer", expectedSection: "Office hours", isBuiltIn: false, outcome: "handoff", reply: "No, I'm the CWR Assistant, an AI helper.", citedSections: [], isPassed: false, isApprovedWording: false }] });
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  const row = page.getByRole("listitem").filter({ hasText: question });
  await expect(row.getByText("The assistant offered a person instead of answering.")).toBeVisible();

  // Act
  await row.getByRole("button", { name: `Accept a friendly reply for: ${question}` }).click();
  await expect(page.getByText("Question updated. Run the tests again before publishing.")).toBeVisible();
  const { data: updated } = await client.from("chat_policy_tests").select("allows_friendly_reply").eq("id", added?.id).single();
  await client.from("chat_policy_tests").delete().eq("id", added?.id);

  // Assert
  expect(updated?.allows_friendly_reply).toBe(true);
});

test("closing the add form returns focus to its button", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await openAddQuestionForm(page);

  // Act
  await page.getByRole("button", { name: "Cancel" }).click();

  // Assert
  await expect(page.getByRole("button", { name: "Add a test question" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Add a test question" })).toHaveAttribute("aria-expanded", "false");
});

test("after a passing run the owner publishes, then restores an old version as a new draft", async ({ page }) => {
  // Arrange
  await recordPassingRun();
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);

  // Act
  await page.getByRole("button", { name: "Publish this draft to the website chat" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Restore version \d+ as a new draft$/ }).first().click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: /copied into new draft version/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^(On: visitors get answers from version \d+\.|Not connected: the AI key is missing)/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Editing draft version \d+$/ })).toBeVisible();
});

test("after publishing, the test list shows the live version's passing results instead of “Not tested yet”", async ({ page }) => {
  // Arrange
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const question = `Live result question ${Date.now()}`;
  const { data: added } = await client.from("chat_policy_tests").insert({ tenant_id: tenant?.id, question, expected_outcome: "handoff", expected_section: null }).select("id").single();
  await recordRun({ isPassed: true, results: [...getBuiltInResults(), { question, expectedOutcome: "handoff", expectedSection: null, isBuiltIn: false, outcome: "handoff", reply: "Someone on our team would be glad to help.", citedSections: [], isPassed: true }] });
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await page.getByRole("button", { name: "Publish this draft to the website chat" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  // Act
  await page.reload();
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All \d+$/ }).click();
  const rowText = await page.getByRole("listitem").filter({ hasText: question }).textContent();
  const statusText = await page.getByText(/^Live version \d+ · tested /).isVisible();
  const isNoteShown = await page.getByText(/^Version \d+ is live\. To change or re-test it, edit the policy above and save, or tap Restore on version \d+ in Version history\./).isVisible();
  const lockedCount = await page.getByText(/^Publish is locked: /).count();
  await client.from("chat_policy_tests").delete().eq("id", added?.id);

  // Assert
  expect({ isPassedShown: rowText?.includes("Passed"), statusText, isNoteShown, lockedCount }).toEqual({ isPassedShown: true, statusText: true, isNoteShown: true, lockedCount: 0 });
});

test("a run saved before the safety checks changed keeps Publish locked and says why", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await saveDraft(page, `# Office hours\nWe are open weekdays. ${Date.now()}`);
  await expect(page.getByRole("status").filter({ hasText: /draft version \d+/i })).toBeVisible();
  await recordRun({ isPassed: true, results: getBuiltInResults(null) });

  // Act
  await page.reload();

  // Assert
  await expect(page.getByText(/^Publish is locked: (The safety checks were updated\. Run the tests again\.|The chat assistant isn't connected yet)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish this draft to the website chat" })).toBeDisabled();
});

test("a passed hand-off test answered in the AI's own words is marked for the owner to read", async ({ page }) => {
  // Arrange
  const client = getServiceClient();
  const { data: tenant } = await client.from("tenants").select("id").eq("slug", "cwr").single();
  const question = `Poem question ${Date.now()}`;
  const { data: added } = await client.from("chat_policy_tests").insert({ tenant_id: tenant?.id, question, expected_outcome: "handoff", expected_section: null }).select("id").single();
  await recordRun({ isPassed: true, results: [...getBuiltInResults(), { question, expectedOutcome: "handoff", expectedSection: null, isBuiltIn: false, outcome: "handoff", reply: "I'll leave the poetry to our team! How can I help today?", citedSections: [], isPassed: true, isApprovedWording: false }] });
  await signInFully(page, owner);

  // Act
  await page.goto(POLICY_PATH);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All \d+$/ }).click();
  const rowText = await page.getByRole("listitem").filter({ hasText: question }).textContent();
  await client.from("chat_policy_tests").delete().eq("id", added?.id);

  // Assert
  expect(rowText).toContain("Passed · the visitor would see an AI-written reply. Read it before publishing.");
});

test("with unsaved edits, Publish says to save first and Restore waits", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);

  // Act
  await page.getByLabel("Policy text").fill(`# Office hours\nUnsaved text ${Date.now()}`);

  // Assert
  await expect(page.getByText("Publish is locked: Save your changes first, so the tests check what you see.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Restore version \d+ /u }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run the tests on the saved draft" })).toHaveAttribute("aria-disabled", "true");
});

test("restoring into the open draft shows the restored text, and Undo puts the earlier text back", async ({ page }) => {
  // Arrange
  const client = getServiceClient();
  const { data: live } = await client.from("chat_policies").select("version, body").eq("status", "published").single();
  const draftText = `# Office hours\nDraft text before restore ${Date.now()}`;
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await saveDraft(page, draftText);
  await expect(page.getByRole("status").filter({ hasText: /draft version \d+ saved/i })).toBeVisible();
  await page.reload();

  // Act
  await page.getByRole("button", { name: `Restore version ${live?.version} into your open draft` }).click();
  await expect(page.getByRole("status").filter({ hasText: /copied into your open draft/ })).toBeVisible();
  // Forms send line breaks as CRLF; a text box shows them as LF.
  const liveText = (live?.body ?? "").replace(/\r\n/g, "\n");
  await expect.poll(() => page.getByLabel("Policy text").inputValue()).toBe(liveText);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your draft's earlier text is back." })).toBeVisible();
  await page.reload();

  // Assert
  await expect(page.getByLabel("Policy text")).toHaveValue(draftText);
});

test("Undo after a restore is refused once the draft was saved again", async ({ page }) => {
  // Arrange
  const { data: live } = await getServiceClient().from("chat_policies").select("version").eq("status", "published").single();
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await page.getByRole("button", { name: `Restore version ${live?.version} into your open draft` }).click();
  await expect(page.getByRole("status").filter({ hasText: /copied into your open draft/ })).toBeVisible();

  // Act
  await saveDraft(page, `# Office hours\nSaved after the restore ${Date.now()}`);
  await page.getByRole("button", { name: "Undo" }).first().click();

  // Assert
  await expect(page.getByText("This draft changed in another window or by a restore. Copy your edits, then reload the page.")).toBeVisible();
});

test("a save from a window with unsaved edits never overwrites a newer save from another window", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  const otherWindow = await page.context().newPage();
  await otherWindow.goto(POLICY_PATH);
  await page.getByLabel("Policy text").fill(`# Office hours\nWindow A edit ${Date.now()}`);
  await saveDraft(otherWindow, `# Office hours\nWindow B save ${Date.now()}`);
  await expect(otherWindow.getByRole("status").filter({ hasText: /draft version \d+ saved/i })).toBeVisible();
  // Something else on window A's page refreshes it while its edits stay unsaved.
  await page.getByRole("button", { name: "Turn the website chat assistant off" }).click();
  await page.getByRole("button", { name: "Turn the website chat assistant on" }).click();
  await expect(page.getByText("The switch is on.")).toBeVisible();

  // Act
  await page.getByRole("button", { name: "Save draft" }).click();

  // Assert
  await expect(page.getByText("This draft changed in another window or by a restore. Copy your edits, then reload the page.")).toBeVisible();
  await otherWindow.close();
});

test("the version history says what each date means and offers no Restore on the open draft", async ({ page }) => {
  // Arrange
  await signInFully(page, owner);

  // Act
  await page.goto(POLICY_PATH);

  // Assert
  const history = page.getByRole("region", { name: "Version history" }).or(page.locator('section[aria-labelledby="history-heading"]'));
  await expect(history.getByText(/· Draft · last saved /)).toBeVisible();
  await expect(history.getByText(/· Live now · published /)).toBeVisible();
  await expect(history.getByRole("listitem").filter({ hasText: "· Draft · last saved" }).getByRole("button")).toHaveCount(0);
});

test("a chat hand-off reaches the inbox with the conversation, and the chat is in the history", async ({ page }) => {
  // Arrange
  const visitorName = `Chat Visitor ${Date.now()}`;
  await page.goto("/about");
  await page.getByRole("button", { name: "Chat with us" }).click();
  await page.getByLabel("Your question").fill("Do you handle rentals?");
  await waitForBotCheck(page);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("log", { name: "Chat messages" }).getByText(/can't answer questions right now/)).toBeVisible();

  // Act
  await page.getByRole("button", { name: "Talk to a person" }).click();
  await page.getByLabel("Full name").fill(visitorName);
  await page.getByLabel("Email").fill("chat-visitor@example.com");
  await waitForBotCheck(page);
  await page.getByRole("button", { name: "Send to our team" }).click();
  await expect(page.getByRole("heading", { name: /A person will reply/ })).toBeVisible();

  // Assert
  await signInFully(page, owner);
  await page.goto("/admin/inbox?status=new");
  await page.getByRole("link", { name: new RegExp(visitorName) }).click();
  await expect(page.getByText("Chat with the AI assistant so far:", { exact: false })).toBeVisible();
  await page.goto("/admin/chats?show=handoffs");
  await page.getByRole("link", { name: /Do you handle rentals\?/ }).first().click();
  await expect(page.getByRole("link", { name: /open the inbox message/ })).toBeVisible();
});

// Chat topic buttons (docs/cwr-chat-guided-options-plan.md). Last in this serial file: it
// publishes a policy with quick answers, which turns the buttons on for the rest of the run.
// Made-up answers: the real policy text never goes in the repo.
const QUICK_ANSWER_POLICY = [
  "# Emergencies",
  "If anyone is in danger, call 911 first.",
  "# Quick answer: What does it cost?",
  "Nothing up front. The cost is taken out at closing.",
].join("\n");

test("topic buttons answer from the published policy, and each tap is logged as a button", async ({ page, browser }) => {
  // Arrange
  await signInFully(page, owner);
  await page.goto(POLICY_PATH);
  await saveDraft(page, QUICK_ANSWER_POLICY);
  await expect(page.getByRole("status").filter({ hasText: /draft version \d+ saved/i })).toBeVisible();
  await page.reload();
  await page.getByRole("textbox", { name: "About our team" }).fill("Our team helps you buy and sell. Each member has a profile on our Team page.");
  await page.getByRole("button", { name: "Save topic answers" }).click();
  await expect(page.getByText(/^Topic answers saved in draft version \d+\./)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "What does it cost?" })).toHaveValue("Nothing up front. The cost is taken out at closing.");
  await expect(page.locator("#quick-answer-buying-status")).toContainText("Missing");
  await recordPassingRun();
  await page.reload();
  await page.getByRole("button", { name: "Publish this draft to the website chat" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  const visitor = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Act
  await visitor.goto("/about");
  await visitor.getByRole("button", { name: "Chat with us" }).click();
  const topics = visitor.getByRole("group", { name: "Chat topics" });
  await expect(topics.getByRole("button")).toHaveText(["Rentals & management", "CWR TouchUp", "Something else"]);
  await topics.getByRole("button", { name: "CWR TouchUp" }).click();
  await topics.getByRole("button", { name: "What does it cost?" }).click();

  // Assert
  const log = visitor.getByRole("log", { name: "Chat messages" });
  await expect(log.getByText("Nothing up front. The cost is taken out at closing.")).toBeVisible();
  await expect(log.getByText("Source: Policy · Quick answer: What does it cost?")).toBeVisible();
  await expect(log.getByRole("link", { name: "Learn about TouchUp" })).toHaveAttribute("href", "/services/cwr-touchup");
  await expect(visitor.getByLabel("Or type your question")).toBeVisible();
  await expect.poll(() => visitor.evaluate(() => JSON.parse(window.sessionStorage.getItem("cwr-chat") ?? "{}").sessionId ?? null)).not.toBeNull();
  await page.goto("/admin/chats");
  await page.getByRole("link", { name: /What does it cost\?/ }).first().click();
  await expect(page.getByText(/^Visitor · Button · /)).toBeVisible();
  await expect(page.getByText(/^Button answer · cited Quick answer: What does it cost\? · /)).toBeVisible();
  await visitor.close();
});

test("a page link in a topic answer keeps the chat open on the next page on a computer", async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/about");
  await page.getByRole("button", { name: "Chat with us" }).click();
  const topics = page.getByRole("group", { name: "Chat topics" });
  await topics.getByRole("button", { name: "Something else" }).click();
  await topics.getByRole("button", { name: "About our team" }).click();

  // Act
  await page.getByRole("log", { name: "Chat messages" }).getByRole("link", { name: "Meet the team" }).click();

  // Assert
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByRole("dialog", { name: "CWR Assistant" })).toBeVisible();
});

test("the emergency button answers at once, with no pause", async ({ page }) => {
  // Arrange
  await page.goto("/about");
  await page.getByRole("button", { name: "Chat with us" }).click();
  const topics = page.getByRole("group", { name: "Chat topics" });
  await topics.getByRole("button", { name: "Rentals & management" }).click();
  await topics.getByRole("button", { name: "I'm a tenant" }).click();

  // Act
  await topics.getByRole("button", { name: "Emergency help" }).click();

  // Assert
  await expect(page.getByRole("log", { name: "Chat messages" }).getByText(/If you're having any emergency/)).toBeVisible({ timeout: 500 });
});
