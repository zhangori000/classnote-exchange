import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Classnote Exchange",
  description:
    "Crowd-sourced lecture notes and study threads for every university class."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-ink-50 text-ink-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
