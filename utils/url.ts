export function resolveUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString();
}
