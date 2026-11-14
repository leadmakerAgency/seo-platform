import type { Tone } from "@/components/common/status"
import type { Database } from "@/lib/supabase/database.types"

export type SocialPlatform = Database["public"]["Enums"]["social_platform"]
export type SocialAccountStatus = Database["public"]["Enums"]["social_account_status"]
export type ConnectAttemptStatus = Database["public"]["Enums"]["connect_attempt_status"]

/** Display order: Google Business Profile first, it matters most for local SEO. */
export const PLATFORMS: SocialPlatform[] = [
  "googlebusiness",
  "facebook",
  "instagram",
  "linkedin",
  "youtube",
  "twitter",
  "tiktok",
  "pinterest",
  "threads",
]

export const PLATFORM_META: Record<
  SocialPlatform,
  { label: string; color: string; help: string; what: string }
> = {
  googlebusiness: {
    label: "Google Business Profile",
    color: "#4285F4",
    help: "The location must be verified on Google. Sign in with a Google account that owns or manages it.",
    what: "Posts, review replies and insights for the map listing.",
  },
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    help: "Sign in as someone who manages the business Page, then pick the Page.",
    what: "Page posts and comments.",
  },
  instagram: {
    label: "Instagram",
    color: "#E4405F",
    help: "Must be a Business or Creator account.",
    what: "Posts, reels and comments.",
  },
  linkedin: {
    label: "LinkedIn",
    color: "#0A66C2",
    help: "Sign in as a Page admin to post as the company.",
    what: "Company page posts.",
  },
  youtube: {
    label: "YouTube",
    color: "#FF0000",
    help: "Pick the business channel (Brand Account) in Google's account chooser.",
    what: "Videos and Shorts.",
  },
  twitter: {
    label: "X",
    color: "#000000",
    help: "Sign in to the business's X account.",
    what: "Posts and threads.",
  },
  tiktok: {
    label: "TikTok",
    color: "#000000",
    help: "Accept every permission TikTok asks for.",
    what: "Videos and photo posts.",
  },
  pinterest: {
    label: "Pinterest",
    color: "#BD081C",
    help: "Pick the board new Pins go to.",
    what: "Pins.",
  },
  threads: {
    label: "Threads",
    color: "#000000",
    help: "Uses the business's Instagram login.",
    what: "Posts.",
  },
}

export const STATUS_META: Record<SocialAccountStatus, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "success" },
  needs_reconnect: { label: "Needs reconnecting", tone: "warning" },
  removed: { label: "Disconnected", tone: "neutral" },
}

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (PLATFORMS as string[]).includes(value)
}

/** Friendly text for the error codes Zernio appends to our callback URL. */
export const CONNECT_ERRORS: Record<string, string> = {
  oauth_denied: "The sign-in was cancelled or declined. Nothing changed.",
  missing_google_permissions:
    "Some Google permissions were unticked. Connect again and keep every box ticked.",
  missing_tiktok_permissions:
    "Some TikTok permissions were declined. Connect again and accept them all.",
  no_google_locations:
    "That Google account manages no Business Profile locations. Sign in with the account that owns the listing.",
  google_locations_error: "Google wouldn't list the locations. Try again in a minute.",
  google_permission_denied: "That Google account doesn't have access to the Business Profile.",
  no_facebook_pages:
    "No Facebook Page was shared. Connect again, click “Edit previous settings” and tick the Page.",
  no_youtube_channel:
    "That Google account has no YouTube channel. Pick the business channel instead.",
  personal_account_not_supported: "Personal accounts can't be connected. Use a business account.",
  account_limit_exceeded:
    "Zernio's account limit was reached. An admin needs to check Zernio billing.",
  payment_required: "Zernio needs a payment method before more accounts can be connected.",
  code_already_redeemed:
    "This sign-in was already used. Check the list below; it may already be connected.",
  reconnect_account_mismatch:
    "That sign-in belongs to a different account than the one being reconnected.",
  account_mismatch: "That sign-in belongs to a different account than expected.",
}

export function connectErrorMessage(code: string | null, fallback?: string | null) {
  if (code && CONNECT_ERRORS[code]) return CONNECT_ERRORS[code]
  return fallback?.trim() || "The connection didn't finish. Try again."
}
