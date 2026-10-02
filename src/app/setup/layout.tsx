import "../globals.css";
import type { Metadata } from "next";
import { bodoni, manrope } from "../fonts";

export const metadata: Metadata = {
  title: "Configuration — RYDAR Privé",
  robots: { index: false, follow: false },
};

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${bodoni.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
