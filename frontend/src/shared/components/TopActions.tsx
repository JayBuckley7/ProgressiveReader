import { SignOutButton } from "@clerk/clerk-react";
// import { SignOutButton } from "./SignOutButton"; // REMOVED - using Clerk's
import { useState } from "react";

interface TopActionsProps {
  currentPage: "library" | "vocabulary" | "grammar" | "stats" | "admin" | "jlpt";
  onShowLogin?: () => void;
}

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAppData } from "@shared/contexts/AppDataContext";
import { useUser } from "@clerk/clerk-react"; // Import useUser to check authentication status

export function TopActions({ currentPage, onShowLogin }: TopActionsProps) {
  const navigate = useNavigate();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { t } = useTranslation();

  // Get app data to check if we have offline content
  const { books } = useAppData();
  const { isSignedIn } = useUser();

  // Allow access if signed in OR if we have offline books
  const showNavigation = isSignedIn || books.length > 0;

  return (
    <header className="app-header">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1 sm:py-1.5">
        {/* Mobile Layout */}
        <div className="flex justify-between items-center sm:hidden">
          <button onClick={() => navigate("/")} className="flex items-center">
            <img
              src="/slow.gif"
              alt={t("nav.appNameFull")}
              className="h-7 w-7 rounded-md object-contain"
            />
            <span className="sr-only">{t("nav.appNameShort")}</span>
          </button>

          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="p-1.5 app-icon-button transition-colors"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={showMobileMenu ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
              />
            </svg>
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {showMobileMenu && (
          <div className="sm:hidden mt-2 py-2 space-y-1">
            {showNavigation ? (
              <>
                <button
                  onClick={() => {
                    navigate("/");
                    setShowMobileMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm app-nav-item ${
                    currentPage === "library" ? "app-nav-active" : ""
                  }`}
                >
                  {t("nav.library")}
                </button>
                <button
                  onClick={() => {
                    navigate("/vocabulary");
                    setShowMobileMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm app-nav-item ${
                    currentPage === "vocabulary" ? "app-nav-active" : ""
                  }`}
                >
                  {t("nav.vocabulary")}
                </button>
                <button
                  onClick={() => {
                    navigate("/clipboard");
                    setShowMobileMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm app-nav-item ${
                    currentPage === "stats" ? "app-nav-active" : ""
                  }`}
                >
                  {t("nav.clipboard")}
                </button>
                <button
                  onClick={() => {
                    navigate("/grammar");
                    setShowMobileMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm app-nav-item ${
                    currentPage === "grammar" ? "app-nav-active" : ""
                  }`}
                >
                  {t("nav.grammar")}
                </button>
                <button
                  onClick={() => {
                    navigate("/jlpt-tests");
                    setShowMobileMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm app-nav-item ${
                    currentPage === "jlpt" ? "app-nav-active" : ""
                  }`}
                >
                  {t("nav.test")}
                </button>

                <div className="pt-2 border-t app-border">
                  {isSignedIn ? (
                  <SignOutButton className="w-full text-left px-3 py-2 rounded text-sm app-nav-item">
                    {t("nav.signOut")}
                  </SignOutButton>
                  ) : (
                    <button
                      onClick={() => {
                        if (window.confirm("Clear offline data and exit?")) {
                          localStorage.removeItem("prOfflineBooks");
                          window.location.reload();
                        }
                      }}
                      className="w-full text-left px-3 py-2 rounded text-sm app-nav-item"
                    >
                      {t("nav.exitOffline")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {onShowLogin && (
                  <button
                    onClick={() => {
                      onShowLogin();
                      setShowMobileMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-sm font-medium app-button-primary"
                  >
                    {t("nav.signIn")}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Desktop Layout */}
        <div className="hidden sm:flex justify-between items-center">
          <button
            onClick={() => navigate("/")}
            aria-label={t("nav.goLibraryAria")}
                  className="text-base font-semibold app-brand hover:opacity-80 transition-colors"
          >
            <img
              src="/slow.gif"
              alt={t("nav.appNameFull")}
              className="h-8 w-8 rounded-md object-contain"
            />
            <span className="sr-only">{t("nav.appNameFull")}</span>
          </button>

          <div className="flex items-center space-x-4">
            {showNavigation ? (
              <>
                <nav className="flex items-center space-x-2">
                  <button
                    onClick={() => navigate("/")}
                    aria-label={t("nav.libraryPageAria")}
                    className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors app-nav-item ${
                      currentPage === "library" ? "app-nav-active" : ""
                    }`}
                  >
                    {t("nav.library")}
                  </button>
                  <button
                    onClick={() => navigate("/vocabulary")}
                    aria-label={t("nav.vocabularyPageAria")}
                    className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors app-nav-item ${
                      currentPage === "vocabulary" ? "app-nav-active" : ""
                    }`}
                  >
                    {t("nav.vocabulary")}
                  </button>
                  <button
                    onClick={() => navigate("/clipboard")}
                    aria-label={t("nav.clipboardPageAria")}
                    className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors app-nav-item ${
                      currentPage === "stats" ? "app-nav-active" : ""
                    }`}
                  >
                    {t("nav.clipboard")}
                  </button>
                  <button
                    onClick={() => navigate("/grammar")}
                    aria-label={t("nav.grammarPageAria")}
                    className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors app-nav-item ${
                      currentPage === "grammar" ? "app-nav-active" : ""
                    }`}
                  >
                    {t("nav.grammar")}
                  </button>
                  <button
                    onClick={() => navigate("/jlpt-tests")}
                    aria-label={t("nav.jlptTestsPageAria") || "JLPT Tests Page"}
                    className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors app-nav-item ${
                      currentPage === "jlpt" ? "app-nav-active" : ""
                    }`}
                  >
                    {t("nav.test")}
                  </button>
                </nav>

                {isSignedIn ? (
                  <SignOutButton className="px-2.5 py-1.5 rounded-md text-sm font-medium app-nav-item">
                    {t("nav.signOut")}
                  </SignOutButton>
                ) : (
                  <button
                    onClick={() => {
                      if (window.confirm("Clear offline data and exit?")) {
                        localStorage.removeItem("prOfflineBooks");
                        window.location.reload();
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-md text-sm font-medium app-nav-item"
                  >
                    {t("nav.exitOffline")}
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={onShowLogin}
                className="px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors app-button-primary"
              >
                {t("nav.signIn")}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
