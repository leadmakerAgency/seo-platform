# Attribution

Shockwave AI Search (`src/features/backlinks/ai-search/`) uses methods summarised from two MIT-licensed projects. The knowledge packs in `knowledge.ts` and the page checks in `checks.ts` and `fetcher.ts` are our own rewritten summaries and ports; no files were copied. The licences are reproduced below as they require.

## Claude SEO

- Repository: https://github.com/AgriciDaniel/claude-seo (v2.6.2)
- Used:
  - **Skills:** `seo-plan` (discovery, industry templates), `seo-local` (business type, vertical, citations, local links), `seo-cluster` (intent), `seo-sxo` (results pages), `seo-backlinks` (competitor gap), `seo-geo` (AI citation sources).
  - **References:** `seo/references/backlink-quality.md`, `local-seo-signals.md`, `local-schema-types.md`.
  - **Scripts:** `verify_backlinks.py` (status model), `url_safety.py` and `fetch_page.py` (fetch safety), `parasite_risk.py`.

```
MIT License

Copyright (c) 2026 agricidaniel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## marketingskills

- Repository: https://github.com/coreyhaines31/marketingskills
- Used: `link-building` (tactics, the four tests, risk rule), `directory-submissions` (tiers, avoid-list, verification), `ai-seo` (cited surfaces), `public-relations`, `competitors` (evidence rules).

```
MIT License

Copyright (c) 2025 Corey Haines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
