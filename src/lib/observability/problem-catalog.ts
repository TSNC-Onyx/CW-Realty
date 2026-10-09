// Every admin action, and every website-visitor action, that can record a problem (docs/cwr-error-tracking-plan.md, Coverage).
// The same list is seeded into cwr.problem_catalog; CI compares the two. Labels are the only
// words problem-alert emails use, so nothing a visitor or staff member typed reaches an email.

type ProblemActionDefinition = {
  label: string;
  /** Exported server action this entry names, checked by scripts/check-error-handling.mts. */
  fn?: string;
  /** Codes whose volume alone signals trouble (for example many wrong passwords). */
  spikeCodes?: readonly string[];
};

export const PROBLEM_SECTIONS = {
  auth: "Sign-in",
  portal: "Admin portal",
  dashboard: "Dashboard",
  listings: "Listings",
  photos: "Photos",
  team: "Team",
  connections: "Connections",
  homework: "Homework",
  inbox: "Inbox",
  closed_deals: "Closed deals",
  chats: "Chats",
  notifications: "Notifications",
  users: "Users",
  chat_policy: "Chat policy",
  tracking: "Ads & analytics",
  contact: "Contact & footer",
  trash: "Trash",
  jobs: "Background jobs",
  database: "Database",
  site: "Website visitors",
  unknown: "Unknown",
} as const;

export const PROBLEM_ACTIONS = {
  "auth.sign_in": { label: "Sign in", fn: "signInAction", spikeCodes: ["invalid_credentials"] },
  "auth.verify_code": { label: "Enter authenticator code", fn: "verifyMfaAction", spikeCodes: ["mfa_verification_failed"] },
  "auth.start_code_setup": { label: "Start authenticator setup", fn: "startMfaSetupAction" },
  "auth.confirm_code_setup": { label: "Finish authenticator setup", fn: "confirmMfaSetupAction" },
  "auth.request_password_reset": { label: "Ask for a password reset", fn: "requestPasswordResetAction" },
  "auth.set_password": { label: "Set a new password", fn: "setPasswordAction" },
  "auth.open_email_link": { label: "Open an invite or reset link" },
  "auth.sign_out": { label: "Sign out" },
  "auth.session_check": { label: "Check the sign-in session" },
  "auth.session_check_invalid": { label: "Unreadable sign-in session" },
  "auth.access_check": { label: "Check admin access" },
  "auth.bot_check_widget": { label: "Load the bot check" },
  "auth.browser_error": { label: "Browser error on a sign-in page" },

  "portal.page_crash": { label: "Open an admin page" },
  "portal.browser_error": { label: "Browser error on an admin page" },
  "portal.keep_alive": { label: "Keep the session active" },
  "portal.page_not_found": { label: "Open a missing admin page" },
  "portal.wrong_role": { label: "Open a page the role can't use" },
  "portal.load_frame": { label: "Load the admin menu" },

  "dashboard.load": { label: "Load the dashboard" },

  "listings.load": { label: "Load listings" },
  "listings.create": { label: "Create a listing", fn: "createListingAction" },
  "listings.update": { label: "Edit a listing", fn: "updateListingAction" },
  "listings.change_state": { label: "Publish or change a listing's status", fn: "transitionListingAction" },
  "listings.move": { label: "Reorder listings", fn: "moveListingAction" },
  "listings.move_photo": { label: "Reorder listing photos", fn: "moveListingPhotoAction" },
  "listings.add_photo": { label: "Add a listing photo", fn: "addListingPhotoAction" },
  "listings.update_photo_alt": { label: "Edit a photo description", fn: "updatePhotoAltAction" },

  "photos.request_upload_link": { label: "Start a photo upload", fn: "requestPhotoUploadAction" },
  "photos.prepare": { label: "Prepare a photo in the browser" },
  "photos.upload": { label: "Upload a photo" },

  "team.load": { label: "Load team members" },
  "team.create": { label: "Add a team member", fn: "createTeamMemberAction" },
  "team.update": { label: "Edit a team member", fn: "updateTeamMemberAction" },
  "team.set_photo": { label: "Set a team member's photo", fn: "setTeamPhotoAction" },
  "team.remove_photo": { label: "Remove a team member's photo", fn: "removeTeamPhotoAction" },
  "team.move": { label: "Reorder team members", fn: "moveTeamMemberAction" },
  "team.set_visibility": { label: "Show or hide a team member", fn: "setTeamMemberVisibilityAction" },

  "connections.load": { label: "Load connections" },
  "connections.create": { label: "Add a connection", fn: "createConnectionAction" },
  "connections.update": { label: "Edit a connection", fn: "updateConnectionAction" },
  "connections.set_photo": { label: "Set a connection's photo", fn: "setConnectionPhotoAction" },
  "connections.remove_photo": { label: "Remove a connection's photo", fn: "removeConnectionPhotoAction" },
  "connections.move": { label: "Reorder connections", fn: "moveConnectionAction" },
  "connections.set_visibility": { label: "Show or hide a connection", fn: "setConnectionVisibilityAction" },
  "connections.set_page_visibility": { label: "Show or hide the Connections page", fn: "setConnectionsPageVisibilityAction" },

  "homework.load": { label: "Load Homework" },
  "homework.create_video": { label: "Add a Homework video", fn: "createHomeworkVideoAction" },
  "homework.create_download": { label: "Add a Homework download", fn: "createHomeworkDownloadAction" },
  "homework.update_video": { label: "Edit a Homework video", fn: "updateHomeworkVideoAction" },
  "homework.update_download": { label: "Edit a Homework download", fn: "updateHomeworkDownloadAction" },
  "homework.move": { label: "Reorder Homework", fn: "moveHomeworkItemAction" },
  "homework.set_visibility": { label: "Show or hide Homework", fn: "setHomeworkVisibilityAction" },
  "homework.set_cover": { label: "Set a Homework cover picture", fn: "setHomeworkCoverAction" },
  "homework.remove_cover": { label: "Remove a Homework cover picture", fn: "removeHomeworkCoverAction" },
  "homework.make_cover": { label: "Make a Homework cover from the video", fn: "setHomeworkVideoCoverAction" },
  "homework.request_upload_link": { label: "Start a Homework file upload", fn: "requestHomeworkUploadAction" },
  "homework.upload_file": { label: "Upload a Homework file" },
  "homework.save_file": { label: "Save an uploaded Homework file", fn: "saveHomeworkFileAction" },
  "homework.remove_captions": { label: "Remove video captions", fn: "removeHomeworkCaptionsAction" },

  "inbox.load": { label: "Load the inbox" },
  "inbox.assign": { label: "Assign a request", fn: "assignThreadAction" },
  "inbox.add_note": { label: "Add an internal note", fn: "addNoteAction" },
  "inbox.send_reply": { label: "Send an email reply", fn: "sendReplyAction" },
  "inbox.set_status": { label: "Close or reopen a request", fn: "setThreadStatusAction" },

  "closed_deals.load": { label: "Load closed deals" },
  "closed_deals.save": { label: "Record a closed deal", fn: "saveClosedDealAction" },
  "closed_deals.export": { label: "Download closed deals" },

  "chats.load": { label: "Load chat logs" },

  "notifications.load": { label: "Load notification settings" },
  "notifications.add_recipient": { label: "Add an alert recipient", fn: "addRecipientAction" },
  "notifications.restore_recipient": { label: "Undo removing an alert recipient", fn: "restoreRecipientAction" },
  "notifications.remove_recipient": { label: "Remove an alert recipient", fn: "removeRecipientAction" },
  "notifications.set_recipient_active": { label: "Pause or resume an alert recipient", fn: "setRecipientActiveAction" },
  "notifications.set_recipient_problem_alerts": { label: "Turn problem alerts on or off", fn: "setRecipientProblemAlertsAction" },
  "notifications.send_test_alert": { label: "Send a test alert", fn: "sendTestAlertAction" },
  "notifications.retry_delivery": { label: "Retry a failed email", fn: "retryDeliveryAction" },

  "users.load": { label: "Load users" },
  "users.invite": { label: "Invite a user", fn: "inviteUserAction" },
  "users.change_role": { label: "Change a user's role", fn: "changeRoleAction" },
  "users.remove_access": { label: "Remove a user's access", fn: "removeAccessAction" },
  "users.restore_access": { label: "Undo removing a user's access", fn: "restoreAccessAction" },
  "users.reset_sign_in_codes": { label: "Reset a user's sign-in codes", fn: "resetSignInCodesAction" },

  "chat_policy.load": { label: "Load the chat policy" },
  "chat_policy.save_draft": { label: "Save the chat policy draft", fn: "savePolicyDraftAction" },
  "chat_policy.restore_version": { label: "Restore an old chat policy", fn: "restorePolicyVersionAction" },
  "chat_policy.publish": { label: "Publish the chat policy", fn: "publishPolicyAction" },
  "chat_policy.add_test": { label: "Add a policy test question", fn: "addPolicyTestAction" },
  "chat_policy.restore_test": { label: "Undo removing a test question", fn: "restorePolicyTestAction" },
  "chat_policy.remove_test": { label: "Remove a policy test question", fn: "removePolicyTestAction" },
  "chat_policy.update_test": { label: "Change a policy test question", fn: "updatePolicyTestAction" },
  "chat_policy.save_quick_answers": { label: "Save the chat topic answers", fn: "saveQuickAnswersAction" },
  "chat_policy.start_tests": { label: "Start the policy tests", fn: "startPolicyTestRunAction" },
  "chat_policy.run_tests": { label: "Run the policy tests", fn: "runPolicyTestBatchAction" },
  "chat_policy.finish_tests": { label: "Save the policy test results", fn: "finishPolicyTestRunAction" },
  "chat_policy.test_chat": { label: "Try the chat assistant", fn: "sendTestChatAction" },
  "chat_policy.set_assistant": { label: "Turn the chat assistant on or off", fn: "setAssistantOnAction" },

  "tracking.load": { label: "Load ads & analytics settings" },
  "tracking.save": { label: "Save ads & analytics settings", fn: "saveTrackingSettingsAction" },
  "tracking.mark_reviewed": { label: "Mark tags reviewed", fn: "markTagsReviewedAction" },

  "contact.load": { label: "Load contact & footer settings" },
  "contact.save": { label: "Save contact & footer settings", fn: "saveSiteSettingsAction" },

  "trash.load": { label: "Load the trash" },
  "trash.move_to_trash": { label: "Move something to the trash", fn: "moveToTrashAction" },
  "trash.restore": { label: "Restore from the trash", fn: "restoreFromTrashAction" },
  "trash.delete_forever": { label: "Delete forever", fn: "deleteForeverAction" },

  "jobs.alert_email": { label: "Send an alert email" },
  "jobs.alert_dead_letter": { label: "Give up on an alert email" },
  "jobs.problem_alerts": { label: "Send problem alerts" },
  "jobs.photo_cleanup": { label: "Nightly photo clean-up" },
  "jobs.watchdog": { label: "Check the database clean-up schedule" },

  "database.scheduled_job": { label: "Nightly database clean-up" },
  "database.health_check": { label: "Background check" },

  "site.contact_form": { label: "Send the contact form" },
  "site.booking_form": { label: "Send the TouchUp request form" },
  "site.bot_check": { label: "Check a visitor with the Quick Check" },
  "site.bot_check_widget": { label: "Load the Quick Check" },
  "site.chat_message": { label: "Send a chat message" },
  "site.chat_assistant": { label: "Get a chat assistant reply" },
  "site.chat_handoff": { label: "Ask for a person from the chat" },
  "site.chat_widget": { label: "Use the chat window" },
  "site.listing_photo": { label: "Show a listing photo" },

  "unknown.unknown": { label: "Unlisted action" },
} as const satisfies Record<string, ProblemActionDefinition>;

export type ProblemAction = keyof typeof PROBLEM_ACTIONS;

export type ProblemArea = keyof typeof PROBLEM_SECTIONS;

export function getProblemArea(action: ProblemAction): ProblemArea {
  return action.slice(0, action.indexOf(".")) as ProblemArea;
}

export function isProblemAction(value: string): value is ProblemAction {
  return Object.hasOwn(PROBLEM_ACTIONS, value);
}
