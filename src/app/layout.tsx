import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";
import { SettingsSync } from "@/features/SettingsSync";

const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Emma English Studio",
  description: "A bright family English learning space, built from your child's own textbooks.",
};

export const viewport: Viewport = { themeColor: "#66BB6A" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SettingsSync />
        {children}
      </body>
    </html>
  );
}
