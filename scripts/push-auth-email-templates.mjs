// Owner script for the hosted project's Supabase Auth email settings (docs/runbooks/email-outbox.md).
// Two jobs, each changing only its own settings:
// - templates: the 33 email settings — subjects, the 13 fallback templates, and notice switches —
//   read from supabase/config.toml and supabase/templates/ (Supabase's fallback if the hook is off);
// - the Send Email hook (--hook on|off): hands every email to the outbox (docs/cwr-email-outbox-plan.md).
// The access token is typed into a hidden prompt. Every run shows the changes and asks first.
//
// See what would change:  node scripts/push-auth-email-templates.mjs --dry-run   (add --hook on|off)
// Apply (asks first):     node scripts/push-auth-email-templates.mjs            (or --hook on / --hook off)
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
const HOOK_FLAG = "--hook";
const HOOK_URI = "pg-functions://postgres/cwr/handle_auth_email";
export const HOOK_KEYS = ["hook_send_email_enabled", "hook_send_email_uri"];
// cwr.email_settings.link_lifetime_seconds assumes Supabase's default link lifetime.
const EXPECTED_LINK_LIFETIME_SECONDS = 3600;
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

/** The 33 Management API email keys the template job may read or change. */
export function getEmailSettingKeys() {
  return [...TEMPLATE_TYPES.map(getTemplateKeys), ...NOTIFICATION_TYPES.map(getNotificationKeys)].flatMap(Object.values);
}

/** Every key this script may touch: the 33 email settings and the 2 hook settings — nothing else. */
export function getAllowedKeys() {
  return [...getEmailSettingKeys(), ...HOOK_KEYS];
}

/** The hook settings for "on" (the outbox sends every email) or "off" (Supabase's mailer). */
export function getHookSettings(isOn) {
  return isOn ? { hook_send_email_enabled: true, hook_send_email_uri: HOOK_URI } : { hook_send_email_enabled: false };
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
  return Object.fromEntries(getAllowedKeys().map((key) => [key, settings[key] ?? null]));
}

// A backup may hold null for a setting the hosted project never had; restoring leaves those alone.
function getRestorableSettings(backup) {
  return Object.fromEntries(Object.entries(getEmailSettings(backup)).filter(([, value]) => value !== null));
}

function isSameValue(current, desired) {
  if (typeof desired === "string") return (current ?? "").trimEnd() === desired.trimEnd();
  return current === desired;
}

/** Each wanted setting whose hosted value differs; keys outside the allowed 35 are never returned. */
export function getChangedKeys(current, desired) {
  return getAllowedKeys().filter((key) => key in desired && !isSameValue(current[key], desired[key]));
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
  const hookIndex = args.indexOf(HOOK_FLAG);
  const hookValue = hookIndex === -1 ? null : args[hookIndex + 1];
  if (hookIndex !== -1 && hookValue !== "on" && hookValue !== "off") throw new EmailSettingsError(`Use ${HOOK_FLAG} on or ${HOOK_FLAG} off`);
  return { isDryRun: args.includes(DRY_RUN_FLAG), restoreFile, hookValue };
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
  console.log(`Send Email hook (the outbox sends every email): ${current.hook_send_email_enabled === true ? `on (${current.hook_send_email_uri})` : "off"}`);
  if (current.mailer_otp_exp !== EXPECTED_LINK_LIFETIME_SECONDS) console.log(`Note: sign-in links last ${current.mailer_otp_exp} seconds here, not ${EXPECTED_LINK_LIFETIME_SECONDS}. Ask Claude to set cwr.email_settings.link_lifetime_seconds to match.`);
  if (current.disable_signup !== true) throw new EmailSettingsError("Sign-ups are on in hosted Supabase. Stopping — turn sign-ups off first (Authentication → Sign In / Providers).");
}

function writeBackup(current) {
  const fileName = `${REPO_ROOT}.auth-email-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(fileName, `${JSON.stringify(getEmailSettings(current), null, 2)}\n`, { mode: BACKUP_FILE_MODE });
  return fileName;
}

function getWantedSettings({ restoreFile, hookValue }) {
  if (restoreFile) return getRestorableSettings(JSON.parse(readFileSync(restoreFile, "utf8")));
  if (hookValue) return getHookSettings(hookValue === "on");
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
  console.log(`Done — the ${Object.keys(wanted).length} settings match. To undo: node scripts/push-auth-email-templates.mjs ${RESTORE_FLAG} ${backupFile}`);
}

async function main() {
  const { isDryRun, restoreFile, hookValue } = getArguments();
  const wanted = getWantedSettings({ restoreFile, hookValue });
  const token = await askQuestion("Supabase access token (hidden): ", { isHidden: true });
  if (!token) throw new EmailSettingsError("No token entered");
  const current = await fetchAuthSettings(token);
  reportSafetySettings(current);
  const changedKeys = getChangedKeys(current, wanted);
  if (changedKeys.length === 0) return console.log("Everything already matches. Nothing to do.");
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
