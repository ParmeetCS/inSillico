import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "InSilico Formulator — AI-Powered Drug Formulation",
  description:
    "In-silico drug formulation and physicochemical prediction platform. Predict LogP, pKa, solubility, bioavailability, and toxicity with AI.",
  keywords: [
    "drug formulation",
    "in-silico",
    "physicochemical prediction",
    "LogP",
    "pKa",
    "solubility",
    "bioavailability",
    "AI",
    "pharma",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <AuthProvider>
          <ToastProvider>
            <div className="particle-bg" />
            <div className="molecule-grid" />
            <Navbar />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
