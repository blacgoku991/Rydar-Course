import localFont from "next/font/local";

export const bodoni = localFont({
  src: [
    { path: "../fonts/bodoni-moda-latin-standard-normal.woff2", style: "normal", weight: "400 900" },
    { path: "../fonts/bodoni-moda-latin-standard-italic.woff2", style: "italic", weight: "400 900" },
  ],
  variable: "--font-bodoni",
  display: "swap",
  fallback: ["Didot", "Times New Roman", "serif"],
});

export const manrope = localFont({
  src: "../fonts/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-manrope",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
