import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rateio — Assinaturas compartilhadas",
  description: "Gerencie cobranças, pagamentos e participantes das suas assinaturas compartilhadas.",
  icons: {
    icon: "/rateio-app-icon.png",
    shortcut: "/rateio-app-icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
