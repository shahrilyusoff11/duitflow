import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DuitFlow — Kewangan harian, lebih teratur",
  description: "Catat belanja melalui chat, pantau bajet melalui dashboard. DuitFlow sedang dibangunkan untuk rutin harian di Malaysia.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ms-MY"
    >
      <body>{children}</body>
    </html>
  );
}
