import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FairShare — Playful Expense Splitting",
  description: "Auditable, membership-aware, and transparent shared expenses app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#FDFBF7] text-[#2C2623]">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
