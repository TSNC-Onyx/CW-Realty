import { Fraunces, Manrope } from "next/font/google";

// next/font downloads both variable fonts at build time and serves them from
// this site (Style §11.2: self-hosted WOFF2, Manrope preloaded, swap).
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  preload: false,
  variable: "--font-fraunces",
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  variable: "--font-manrope",
});

export const FONT_VARIABLE_CLASSES = `${fraunces.variable} ${manrope.variable}`;
