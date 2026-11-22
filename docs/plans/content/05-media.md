# Content · 05 · Media

## Upload (browser → Supabase Storage)

`components/use-media-upload.ts`:

1. **Checks** the type and size: images 20 MB (JPEG, PNG, WebP, GIF), videos 500 MB (MP4, MOV, WebM), PDFs 100 MB.
2. **Reads** the width, height and duration in the browser; for a video, grabs one frame as a JPEG preview.
3. **Uploads** with the person's own session to `content-media/<client_id>/<media_id>/<file>` (storage RLS checks the client and the role), plus `preview.jpg` for a video.
4. **Records** the row with `recordMedia()` → `save_content_media` (which checks that the object exists). On failure it removes the uploaded objects.

Nothing goes through our server. Files above Supabase's project upload limit fail with a clear message (an admin raises it in Supabase → Storage → Settings).

## Library (Media tab)

- **The grid:** filters (all, images, videos, PDFs), size, "used N×", "no alt text".
- **Details:** name, alt text, and Delete, which is refused while a draft or scheduled post or article uses the file.
- **Previews** are 1-hour signed URLs.

## Push to Zernio (at schedule time)

`pushMediaToZernio()` in `features/content/server.ts`:

- **Reuse:** a Zernio copy uploaded under 6 days ago is reused.
- **Otherwise:**
  1. `presignMedia`;
  2. read the object through a signed URL and `PUT` it to `uploadUrl` (buffered up to 25 MB, streamed above);
  3. save `zernio_url`.
- **Timing:** the post is created at Zernio right after, which makes Zernio keep the files permanently.

**Alt text** is sent with every image (`mediaItems[].altText`).
