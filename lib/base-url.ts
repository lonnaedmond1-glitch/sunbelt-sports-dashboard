export function getBaseUrl(): string {
  // In Vercel production, use the production URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Fallback for local development
  return 'http://localhost:3000';
}
