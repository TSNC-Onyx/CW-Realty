# Runbook: hosted sign-in email templates

Governs: the admin invite and password-reset emails sent by Supabase Auth. Design: `docs/cwr-branded-email-templates-plan.md`.

The repo files `supabase/templates/invite.html` and `recovery.html` are generated from `src/lib/email/auth-templates.ts` (`npm run email:templates`; a unit test fails if they drift). Local Supabase reads them through `supabase/config.toml`. The hosted project does **not** read the repo: after any change, copy them in by hand with the steps below.

## When to run

After a merge to `build1` that changes either template file, once the production deploy has finished.

## Steps

0. **Logo is live.** Open `https://www.charliewardrealty.com/brand/cwr-logo-email.png`. It must show the round CWR logo. If not, stop: the deploy hasn't finished.
1. **Back up.** In Supabase → Authentication → Emails, open **Invite user** and **Reset password**. Copy each subject and message body into a private note (not the repo).
2. **Check link tracking.** In Supabase → Authentication → SMTP Settings, note which service sends sign-in emails. In that service (MailerSend), confirm click tracking and open tracking are **off**. Tracking rewrites the sign-in links and can break them.
3. **Apply.** For **Invite user**, replace the message body with the full contents of `supabase/templates/invite.html`. For **Reset password**, use `recovery.html`. Leave the subjects as they are ("Your invite to the CWR admin portal", "Reset your CWR admin password"). Save each.
4. **Read back.** Reopen each template and copy what Supabase saved. Compare it with the repo file (Claude can do this if you paste it). If anything was removed or changed, go to step 6.
5. **Test.**
   - On the admin sign-in page, choose **Forgot password** for your own account. Check the email in Gmail and in Outlook, then click the button. It must open the "choose a new password" page.
   - On Admin → Users, invite a throwaway address you control. Check the email and click the button. It must open the "set your password" page. Then remove that user.
6. **Roll back if needed.** Paste the bodies saved in step 1 back into both templates and save.

## Rolling back the app emails

The five website emails (new request, visitor copy, reply, test alert, problem digest) are built in the app. Reverting the pull request and deploying restores the old look; nothing in the database changes.
