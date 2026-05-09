"use client";

import { useState, useEffect } from "react";
import { Search, Bell } from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { BRANDING } from "@/config/branding";

export function TopBar() {
  const [showSearch, setShowSearch] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  return (
    <>
      <div
        className="top-bar"
        style={{
          position: "fixed",
          top: 0,
          left: isMobile ? 0 : "68px",
          right: 0,
          height: "48px",
          backgroundColor: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "0 12px" : "0 20px",
          zIndex: 45,
        }}
      >
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "18px" }}>🦞</span>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: isMobile ? "14px" : "16px",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.5px",
            }}
          >
            TenacitOS
          </h1>
          {!isMobile && (
            <div
              style={{
                backgroundColor: "var(--accent-soft)",
                borderRadius: "4px",
                padding: "2px 8px",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "1px",
                }}
              >
                v1.0
              </span>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {isMobile ? (
            <button
              onClick={() => setShowSearch(true)}
              style={{
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "var(--surface-elevated)",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Search style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
            </button>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-2 transition-all"
              style={{
                width: "240px",
                height: "32px",
                backgroundColor: "var(--surface-elevated)",
                borderRadius: "6px",
                padding: "0 12px",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Search style={{ width: "16px", height: "16px", color: "var(--text-muted)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-muted)" }}>
                Search... ⌘K
              </span>
            </button>
          )}

          <NotificationDropdown />

          <div className="flex items-center gap-2">
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "14px",
                backgroundColor: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontFamily: "var(--font-heading)", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                {BRANDING.ownerUsername.charAt(0).toUpperCase()}
              </span>
            </div>
            {!isMobile && (
              <span style={{ fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>
                {BRANDING.ownerUsername}
              </span>
            )}
          </div>
        </div>
      </div>

      {showSearch && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}
          onClick={() => setShowSearch(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "90%", maxWidth: "42rem" }}>
            <GlobalSearch />
          </div>
        </div>
      )}
    </>
  );
}
