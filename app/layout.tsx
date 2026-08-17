import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BursaValuer · 马股估值器",
  description:
    "Bursa Malaysia stock valuation — DCF, Gordon DDM and Normalized PE Band. 马来西亚股市估值器",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
