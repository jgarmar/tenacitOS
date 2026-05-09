"use client";

import { useState, useEffect } from "react";
import { Dock, TopBar, StatusBar } from "@/components/TenacitOS";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div className="tenacios-shell" style={{ minHeight: "100vh" }}>
      <Dock />
      <TopBar />

      <main
        style={{
          marginLeft: isMobile ? 0 : "68px",
          marginTop: "48px",
          marginBottom: isMobile ? "64px" : "32px",
          minHeight: "calc(100vh - 48px - 32px)",
          padding: isMobile ? "16px 12px" : "24px",
          overflowX: "hidden",
        }}
      >
        {children}
      </main>

      {!isMobile && <StatusBar />}
    </div>
  );
}
