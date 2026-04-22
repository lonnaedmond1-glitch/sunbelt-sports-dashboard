import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Construction Management Portal | Sunbelt Sports",
  description: "Real-time logistics command center for Sunbelt Sports construction operations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isPreview = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';
  return (
    <html lang="en">
      <head>
        {isPreview && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script
            data-recording-token="hKdKhFsPqVGIPK8fzI2xDe6CMdgovYtdNd3vPKhf"
            data-is-production-environment="false"
            src="https://snippet.meticulous.ai/v1/meticulous.js"
          />
        )}
      </head>
      <body>
        <Sidebar />
        <main className="ml-16">{children}</main>
      </body>
    </html>
  );
}
