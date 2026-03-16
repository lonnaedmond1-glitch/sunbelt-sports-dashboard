import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Construction Management Portal | Sunbelt Sports",
  description: "Real-time logistics command center for Sunbelt Sports construction operations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <main className="ml-16">{children}</main>
      </body>
    </html>
  );
}
