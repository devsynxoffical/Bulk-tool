import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "DEVSYNX Email Suite — Cold Outreach & Scraper",
  description:
    "Cold email outreach, multi-inbox rotation, zero-cost email verifier, and Google Maps lead scraper.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased text-zinc-900 bg-zinc-50 selection:bg-blue-100 selection:text-blue-900">
        {children}
      </body>
    </html>
  );
}
