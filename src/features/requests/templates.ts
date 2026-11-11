import type { RequestKind, RequestOptions } from "./constants"

/**
 * One-click starting points for the New request dialog. Written for the client:
 * plain words, no jargon. Edit freely; they only pre-fill the form.
 * (Phase 2: make these editable in Settings.)
 */
export type RequestTemplate = {
  id: string
  label: string
  kind: RequestKind
  title: string
  instructions: string
  options: RequestOptions
  autoComplete: boolean
}

/** The address clients add to Search Console, Analytics and their Google profile. */
export const AGENCY_ACCESS_EMAIL = "seo@leadmaker.agency"

export const REQUEST_TEMPLATES: RequestTemplate[] = [
  {
    id: "phone-code",
    label: "Phone verification code",
    kind: "code",
    title: "Verification code we just triggered",
    instructions:
      "We're verifying one of your business listings. You'll get a text or call with a short code in the next few minutes. Type it below as soon as it arrives; most codes expire within an hour.",
    options: {},
    autoComplete: true,
  },
  {
    id: "gbp-access",
    label: "Google Business Profile access",
    kind: "action",
    title: "Give us access to your Google Business Profile",
    instructions:
      "We need manager access to your Google Business Profile to keep it up to date and reply to reviews. It takes about two minutes.",
    options: {
      steps: [
        "Go to business.google.com and sign in with the Google account that owns your profile.",
        "Open your business, then click the three dots (⋮) and choose “Business Profile settings”.",
        "Click “People and access”, then “Add”.",
        `Enter ${AGENCY_ACCESS_EMAIL}, choose “Manager” and click “Invite”.`,
      ],
      help_url: "https://support.google.com/business/answer/3403100",
    },
    autoComplete: false,
  },
  {
    id: "search-console",
    label: "Search Console and Analytics",
    kind: "action",
    title: "Add our reporting account to Search Console and Google Analytics",
    instructions:
      "This lets us see how people find your website on Google. We only get read access; we can't change anything.",
    options: {
      steps: [
        "Open search.google.com/search-console and pick your website.",
        "Go to Settings, then “Users and permissions”, then “Add user”.",
        `Enter ${AGENCY_ACCESS_EMAIL} with “Restricted” permission and click “Add”.`,
        "Open analytics.google.com, then Admin (the gear icon), then “Property access management”.",
        `Click “+”, choose “Add users”, enter ${AGENCY_ACCESS_EMAIL} with the “Viewer” role and click “Add”.`,
      ],
      help_url: "https://support.google.com/webmasters/answer/7687615",
    },
    autoComplete: false,
  },
  {
    id: "wordpress-plugin",
    label: "Install the WordPress plugin",
    kind: "action",
    title: "Install the LeadMaker plugin on your website",
    instructions:
      "The plugin lets us publish articles and fix small SEO issues on your site without needing your password. If someone else looks after your website, forward them this link.",
    options: {
      steps: [
        "Download the plugin file we sent you (a .zip file).",
        "In your WordPress dashboard go to Plugins, then “Add New”, then “Upload Plugin”.",
        "Choose the .zip file, click “Install Now”, then “Activate”.",
        "Open the new “LeadMaker” menu item and click “Connect”.",
      ],
    },
    autoComplete: false,
  },
  {
    id: "job-photos",
    label: "Before-and-after photos",
    kind: "files",
    title: "Before-and-after photos of recent jobs",
    instructions:
      "Photos of real jobs help you stand out on Google. Send a few before-and-after pairs from the last couple of months. Phone photos are perfect.",
    options: { accept: "images", min_files: 3, max_files: 10 },
    autoComplete: false,
  },
  {
    id: "brand-files",
    label: "Logo and brand files",
    kind: "files",
    title: "Your logo and brand files",
    instructions:
      "Send your logo (the highest quality you have) and anything else with your branding, like a business card or flyer.",
    options: { accept: "any", min_files: 1, max_files: 10 },
    autoComplete: false,
  },
  {
    id: "approve-article",
    label: "Approve an article",
    kind: "approval",
    title: "Approve this article before we publish it",
    instructions:
      "We've written an article for your website. Have a quick read and let us know if it's good to publish, or what to change.",
    options: {},
    autoComplete: false,
  },
  {
    id: "approve-listing",
    label: "Approve a paid listing",
    kind: "approval",
    title: "Approve a paid listing",
    instructions:
      "This listing would send more local customers your way. It costs the amount below, paid by you directly. Approve it and we'll set it up.",
    options: { amount: 250, currency: "USD" },
    autoComplete: false,
  },
  {
    id: "business-details",
    label: "Check your business details",
    kind: "question",
    title: "Check your hours, services and service areas",
    instructions:
      "We want every listing to match exactly. Please write your opening hours (including weekends), the services you offer, and the towns or areas you cover.",
    options: { answer: "long" },
    autoComplete: false,
  },
  {
    id: "directory-login",
    label: "Directory login email",
    kind: "question",
    title: "Which email do you use for this account?",
    instructions:
      "We found an existing listing for your business. Which email address was used to create it? If you don't know, just say so.",
    options: { answer: "short" },
    autoComplete: true,
  },
]
