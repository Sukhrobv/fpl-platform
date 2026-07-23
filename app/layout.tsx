import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { FplSettingsProvider } from "@/contexts/FplSettingsContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "FPL Analytics - AI-Powered Assistant",
  description: "Fantasy Premier League analytics platform with AI assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <FplSettingsProvider>
            <AppShell>{children}</AppShell>
          </FplSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
