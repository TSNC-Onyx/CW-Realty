// One-time copy of the branded Supabase Auth emails (all 13 types) to the hosted project
// (docs/cwr-branded-email-templates-plan.md, Phase 2; steps in docs/runbooks/auth-email-templates.md).
// It changes only the 33 email settings — subjects, templates, and notice switches — read from
// supabase/config.toml and supabase/templates/. The access token is typed into a hidden prompt.
//
// See what would change:  node scripts/push-auth-email-templates.mjs --dry-run
// Apply (asks first):     node scripts/push-auth-email-templates.mjs
// Undo from a backup:     node scripts/push-auth-email-templates.mjs --restore .auth-email-backup-<time>.json

import { readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_REF = "egadvqpatnlkvgiiszzx";
const AUTH_CONFIG_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
// Paths are from the repo root, so the script works from any folder and backups land where git ignores them.
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONFIG_FILE = `${REPO_ROOT}supabase/config.toml`;
const DRY_RUN_FLAG = "--dry-run";
const RESTORE_FLAG = "--restore";
const BACKUP_FILE_MODE = 0o600;
const CONFIRM_WORD = "yes";

export const TEMPLATE_TYPES = ["invite", "confirmation", "recovery", "magic_link", "email_change", "reauthentication"];
export const NOTIFICATION_TYPES = [
  "password_changed",
  "email_changed",
  "phone_changed",
  "identity_linked",
  "identity_unlinked",
  "mfa_factor_enrolled",
  "mfa_factor_unenrolled",
];

class EmailSettingsError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmailSettingsError";
  }
}

function getTemplateKeys(type) {
  return { subject: `mailer_subjects_${type}`, content: `mailer_templates_${type}_content` };
}

function getNotificationKeys(type) {
  return {
    subject: `mailer_subjects_${type}_notification`,
    content: `mailer_templates_${type}_notification_content`,
    enabled: `mailer_notifications_${type}_enabled`,
  };
}

/** The 33 Management API email keys this script may read or change — nothing else. */
export function getEmailSettingKeys() {
  return [...TEMPLATE_TYPES.map(getTemplateKeys), ...NOTIFICATION_TYPES.map(getNotificationKeys)].flatMap(Object.values);
}

function getSectionValues(toml, section) {
  const start = toml.indexOf(`\n[${section}]\n`);
  if (start === -1) throw new EmailSettingsError(`${CONFIG_FILE} has no [${section}] section`);
  const body = toml.slice(start + section.length + 4).split(/\n\[/)[0];
  const pairs = [...body.matchAll(/^(\w+)\s*=\s*(?:"([^"]*)"|(true|false))\s*$/gm)];
  return Object.fromEntries(pairs.map(([, key, text, flag]) => [key, text ?? flag === "true"]));
}

function getTemplateFile(contentPath, readTemplate) {
  return readTemplate(contentPath.replace(/^\.\//, ""));
}

/** The hosted email settings that match the repo, built from config.toml and the template files. */
export function getDesiredEmailSettings({ toml, readTemplate }) {
  const templates = TEMPLATE_TYPES.map((type) => {
    const { subject, content_path: contentPath } = getSectionValues(toml, `auth.email.template.${type}`);
    const keys = getTemplateKeys(type);
    return { [keys.subject]: subject, [keys.content]: getTemplateFile(contentPath, readTemplate) };
  });
  const notifications = NOTIFICATION_TYPES.map((type) => {
    const { subject, content_path: contentPath, enabled } = getSectionValues(toml, `auth.email.notification.${type}`);
    const keys = getNotificationKeys(type);
    return { [keys.subject]: subject, [keys.content]: getTemplateFile(contentPath, readTemplate), [keys.enabled]: enabled === true };
  });
  return Object.assign({}, ...templates, ...notifications);
}

function getEmailSettings(settings) {
  return Object.fromEntries(getEmailSettingKeys().map((key) => [key, settings[key] ?? null]));
}

// A backup may hold null for a setting the hosted project never had; restoring leaves those alone.
function getRestorableSettings(backup) {
  return Object.fromEntries(Object.entries(getEmailSettings(backup)).filter(([, value]) => value !== null));
}

function isSameValue(current, desired) {
  if (typeof desired === "string") return (current ?? "").trimEnd() === desired.trimEnd();
  return current === desired;
}

/** Each wanted email setting whose hosted value differs; keys outside the 33 are never returned. */
export function getChangedKeys(current, desired) {
  return getEmailSettingKeys().filter((key) => key in desired && !isSameValue(current[key], desired[key]));
}

function getChangeLine(key, current, desired) {
  if (key.endsWith("_content")) return `  ${key}: template replaced (${(current ?? "").length} → ${String(desired ?? "").length} characters)`;
  return `  ${key}: ${JSON.stringify(current ?? null)} → ${JSON.stringify(desired)}`;
}

function getArguments() {
  const args = process.argv.slice(2);
  const restoreIndex = args.indexOf(RESTORE_FLAG);
  const restoreFile = restoreIndex === -1 ? null : args[restoreIndex + 1];
  if (restoreIndex !== -1 && !restoreFile) throw new EmailSettingsError(`Give the backup file after ${RESTORE_FLAG}`);
  return { isDryRun: args.includes(DRY_RUN_FLAG), restoreFile };
}

function askQuestion(question, { isHidden }) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (isHidden) prompt._writeToOutput = (text) => (text.startsWith(question) ? process.stdout.write(question) : undefined);
  return new Promise((resolve) => {
    prompt.question(question, (answer) => {
      prompt.close();
      if (isHidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function fetchAuthSettings(token) {
  const response = await fetch(AUTH_CONFIG_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new EmailSettingsError(`Supabase refused to read the settings (${response.status}). Check the token's project and Auth Config permission.`);
  return response.json();
}

async function saveEmailSettings(token, desired) {
  const response = await fetch(AUTH_CONFIG_URL, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(desired),
  });
  if (!response.ok) throw new EmailSettingsError(`Supabase refused the change (${response.status}): ${(await response.text()).slice(0, 300)}`);
}

function reportSafetySettings(current) {
  const enabledNotices = NOTIFICATION_TYPES.filter((type) => current[getNotificationKeys(type).enabled] === true);
  console.log(`Sign-ups off: ${current.disable_signup === true ? "yes" : "NO"}`);
  console.log(`Email changes confirmed on both addresses: ${current.mailer_secure_email_change_enabled === true ? "yes" : "no"}`);
  console.log(`Security notices on now: ${enabledNotices.length > 0 ? enabledNotices.join(", ") : "none"}`);
  if (current.disable_signup !== true) throw new EmailSettingsError("Sign-ups are on in hosted Supabase. Stopping — turn sign-ups off first (Authentication → Sign In / Providers).");
}

function writeBackup(current) {
  const fileName = `${REPO_ROOT}.auth-email-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(fileName, `${JSON.stringify(getEmailSettings(current), null, 2)}\n`, { mode: BACKUP_FILE_MODE });
  return fileName;
}

function getWantedSettings(restoreFile) {
  if (restoreFile) return getRestorableSettings(JSON.parse(readFileSync(restoreFile, "utf8")));
  return getDesiredEmailSettings({ toml: readFileSync(CONFIG_FILE, "utf8"), readTemplate: (filePath) => readFileSync(`${REPO_ROOT}${filePath}`, "utf8") });
}

async function confirmAndApply({ token, current, wanted, changedKeys }) {
  const answer = await askQuestion(`Apply these ${changedKeys.length} changes to the live site? Type "${CONFIRM_WORD}": `, { isHidden: false });
  if (answer !== CONFIRM_WORD) return console.log("Nothing changed.");
  const backupFile = writeBackup(current);
  console.log(`Saved the current email settings to ${backupFile} (only you can read it).`);
  await saveEmailSettings(token, Object.fromEntries(changedKeys.map((key) => [key, wanted[key]])));
  const stillDifferent = getChangedKeys(await fetchAuthSettings(token), wanted);
  if (stillDifferent.length > 0) throw new EmailSettingsError(`Saved, but these don't match when read back: ${stillDifferent.join(", ")}. Undo with ${RESTORE_FLAG} ${backupFile}`);
  console.log(`Done — the ${Object.keys(wanted).length} email settings match. To undo: node scripts/push-auth-email-templates.mjs ${RESTORE_FLAG} ${backupFile}`);
}

async function main() {
  const { isDryRun, restoreFile } = getArguments();
  const wanted = getWantedSettings(restoreFile);
  const token = await askQuestion("Supabase access token (hidden): ", { isHidden: true });
  if (!token) throw new EmailSettingsError("No token entered");
  const current = await fetchAuthSettings(token);
  reportSafetySettings(current);
  const changedKeys = getChangedKeys(current, wanted);
  if (changedKeys.length === 0) return console.log("All 33 email settings already match. Nothing to do.");
  console.log(`${changedKeys.length} email settings would change:\n${changedKeys.map((key) => getChangeLine(key, current[key], wanted[key])).join("\n")}`);
  if (isDryRun) return console.log("Dry run — nothing changed.");
  await confirmAndApply({ token, current, wanted, changedKeys });
  console.log("Now delete the access token in Supabase → Account → Access Tokens.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof EmailSettingsError ? error.message : error);
    process.exit(1);
  });
}
