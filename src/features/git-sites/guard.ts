/**
 * True when the text would be read as a template tag by Nunjucks / Liquid (Eleventy renders post
 * bodies with them first): `{{ … }}`, `{% … %}` or `{# … #}`. Pure and tiny, so the front matter
 * preview in the browser doesn't load the HTML → Markdown converter.
 */
export function needsTemplateGuard(markdown: string): boolean {
  return /\{\{|\{%|\{#/.test(markdown)
}
