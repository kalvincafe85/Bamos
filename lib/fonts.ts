import { Source_Sans_3 } from "next/font/google";

// Myriad Pro is an Adobe-licensed font and can't be loaded on the web without
// owning the license. Source Sans is Adobe's own open-source humanist sans
// with very similar proportions/weight, used as the closest free stand-in.
export const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-source-sans",
});
