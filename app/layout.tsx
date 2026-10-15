import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "./globals.css";
import { ToastProvider } from "@/lib/useToast";

export const metadata: Metadata = {
  title: "Day Book",
  description: "Alice Carter Studio — classes, attendance and tuition",
  appleWebApp: { capable: true, title: "Day Book", statusBarStyle: "default" },
  icons: { icon: "/logo.jpg", apple: "/logo.jpg" },
};

export const viewport: Viewport = {
  themeColor: "#EAE3D4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
