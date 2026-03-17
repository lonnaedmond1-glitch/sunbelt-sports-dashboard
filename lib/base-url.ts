export function getBaseUrl(): string {
  // Prefer the stable alias URL (doesn't change per deployment)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  // Fallback: auto-generated deployment URL from Vercel
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Local development
  return 'http://localhost:3000';
}
