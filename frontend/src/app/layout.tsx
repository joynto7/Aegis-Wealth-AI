import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aegis Wealth AI",
  description: "A wealth-advisory sandbox: profile, compare, propose, check, confirm, execute, record.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-(--bg) text-(--text) font-sans">
        <Providers>{children}</Providers>
        <Toaster position="top-right" closeButton />
      </body>
    </html>
  );
}
