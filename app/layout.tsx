import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import GlobalFormFieldState from "@/components/ui/global-form-field-state";
import NavigationLoadingOverlay from "@/components/ui/NavigationLoadingOverlay";
import "./globals.css";

export const metadata: Metadata = {
  title: "Credence Craft | Business Operations",
  description: "Credence Craft ERP business operations workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body>
        <GlobalFormFieldState />
        <Suspense fallback={<NavigationLoadingOverlay label="Loading application" />}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}