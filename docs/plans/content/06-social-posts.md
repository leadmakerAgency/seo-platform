# Content · 06 · Social posts

## Post page (`components/post-editor.tsx`, route `/content/posts/[postId]`)

Its own page: `/content/posts/new` (plus `?date=` from a calendar day) or `/content/posts/<id>`. Old `?post=` links redirect there. Writing on the left (accounts, text and per-account tabs, files); on the right, sticky on wide screens: Publish (date, time, buttons), Checks, Preview. A new post gets its address on the first save without reloading. After Schedule or Publish now the browser returns to Content → Posts (the toast's "View" opens the post); a sent post's page shows what went out per account.

- **Post to:** the client's connected accounts (WordPress excluded). Accounts that need reconnecting are greyed out and can't be picked.
- **Text:**
  - The "Everyone" tab holds the main text, with a live count per platform (`PLATFORM_RULES` limits) and "Add signature".
  - **One tab per account** offers different text, different files and the platform's options:

    | Platform | Options |
    |---|---|
    | Instagram | Feed/Reel or Story |
    | Facebook | Feed, Story or Reel |
    | YouTube | Title, visibility |
    | Pinterest | Board ID, title, link |
    | Google Business | Button and its link (defaults to settings) |
    | TikTok | Privacy, comments and the required consent |
- **Files:** from the library or uploaded on the spot. Their order is changed with arrow buttons.
- **When:** a date and time in the client's time zone (`content_settings.timezone`), and an optional internal name.
- **Checks:** `checkTarget()` per account, live (see below). "Check with Zernio" saves, pushes the files and calls `validatePost`.
- **Preview:** a neutral card per account, with the text cut where the platform shows "see more", and the first file.
- **Questions before work:** every confirm ("Publish now?", "Schedule for …?") is asked before the work starts, never inside a React transition (see 09, "Publish now did nothing").
- **Buttons:**
  - Drafts: Schedule, Publish now (with a confirm) and Save draft.
  - Scheduled posts: Save changes (sent to Zernio at once), Publish now and Cancel post.

## Local rules (`constants.ts`, `checkTarget`)

| Platform | Text | Files |
|---|---|---|
| X | 280; costs from the Zernio balance ($0.015, $0.20 with a link) | ≤ 4 images or 1 video |
| Instagram | 2,200 | Needs media; Story = exactly one |
| LinkedIn | 3,000 | ≤ 20 images, 1 video or 1 PDF |
| Facebook | 63,206 | ≤ 10 images or 1 video |
| Google Business | 1,500; button link must be https | 1 image, no video |
| Threads | 500 | ≤ 20 |
| Pinterest | 500 | 1 image or video; board required |
| TikTok | 2,200 | Video or photos; consent required |
| YouTube | Description 5,000; title ≤ 100 | Exactly 1 video |

- **Everywhere:** no mixing of images, video and PDF where the platform doesn't allow it; a warning for images without alt text and near-limit text.
- **The authority:** Zernio's validation answers last.

## Sending (`actions.ts`, `sendPost`)

1. Load the post through RLS and run the local rules; every account must be connected.
2. `content_claim_send` (one send at a time).
3. `pushMediaToZernio`, then `buildPostBody`, then Zernio's `validatePost`: any error stops the send with Zernio's words (a validation outage doesn't block).
4. Then, by mode:
   - **schedule:** `createPost`;
   - **now:** a scheduled post is deleted at Zernio first, then `createPost` with `publishNow`;
   - **update:** `updatePost`.
5. `storePost(…, {release, sent_version, actor})`.
6. On a Zernio error, the error is saved on the post. A failed "publish now" (not a 4xx refusal) marks the post failed.

## After sending

| State | Shown | Actions |
|---|---|---|
| Scheduled | Editable | Save changes, Publish now, Cancel (→ cancelled; editing again makes it a draft) |
| Publishing | Per-account status | (wait; the page refreshes every 10 s) |
| Published / partial / failed | Per-account status, link and error with a fix hint (`auth_expired` → reconnect in Connections, …) | Try again (failed accounts only), Duplicate, Delete (failed), and per published account Edit text and Take down |
