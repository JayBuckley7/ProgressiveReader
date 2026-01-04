import { SignedIn, SignedOut, SignOutButton } from "@clerk/clerk-react";
// import { SignOutButton } from "./SignOutButton"; // REMOVED - using Clerk's
import { useState } from "react";

interface TopActionsProps {
  currentPage: "library" | "vocabulary" | "stats" | "admin" | "jlpt";
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
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
        {/* Mobile Layout */}
        <div className="flex justify-between items-center sm:hidden">
          <button
            onClick={() => navigate("/")}
            className="flex items-center"
          >
            <img src="/icon.png" alt={t('nav.appIconAlt')} className="w-5 h-5 mr-1.5" />
            <span className="text-sm font-bold text-gray-900">{t('nav.appNameShort')}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-1.5 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showMobileMenu ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {showMobileMenu && (
          <div className="sm:hidden mt-2 py-2 space-y-1">
            {showNavigation ? (
              <>
                <button
                  onClick={() => { navigate("/"); setShowMobileMenu(false); }}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${currentPage === "library" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                    }`}
                >
                  📚 {t('nav.library')}
                </button>
                <button
                  onClick={() => { navigate("/vocabulary"); setShowMobileMenu(false); }}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${currentPage === "vocabulary" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                    }`}
                >
                  📝 {t('nav.vocabulary')}
                </button>
                <button
                  onClick={() => { navigate("/clipboard"); setShowMobileMenu(false); }}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${currentPage === "stats" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                    }`}
                >
                  📋 {t('nav.clipboard')}
                </button>
                <button
                  onClick={() => { navigate("/jlpt-tests"); setShowMobileMenu(false); }}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${currentPage === "jlpt" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                    }`}
                >
                  📝 Test
                </button>
                <div className="pt-2 border-t">
                  {isSignedIn ? (
                    <SignOutButton className="w-full text-left px-3 py-2 text-gray-600 rounded text-sm hover:bg-gray-100" />
                  ) : (
                    <button
                      onClick={() => {
                        if (window.confirm("Clear offline data and exit?")) {
                          localStorage.removeItem('prOfflineBooks');
                          window.location.reload();
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-gray-600 rounded text-sm hover:bg-gray-100"
                    >
                      🚪 Exit Offline Mode
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {onShowLogin && (
                  <button
                    onClick={() => { onShowLogin(); setShowMobileMenu(false); }}
                    className="w-full text-left px-3 py-2 bg-blue-600 text-white rounded text-sm"
                  >
                    📧 {t('nav.signIn')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Desktop Layout */}
        <div className="hidden sm:flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/")}
              aria-label={t('nav.goLibraryAria')}
              className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors flex items-center"
            >
              <img src="/icon.png" alt={t('nav.appIconAlt')} className="w-6 h-6 mr-2" />
              {t('nav.appNameFull')}
            </button>

          </div>

          <div className="flex items-center space-x-4">
            {showNavigation ? (
              <>
                <nav className="flex items-center space-x-1">
                  <button
                    onClick={() => navigate("/")}
                    aria-label={t('nav.libraryPageAria')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === "library"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                  >
                    📚 {t('nav.library')}
                  </button>
                  <button
                    onClick={() => navigate("/vocabulary")}
                    aria-label={t('nav.vocabularyPageAria')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === "vocabulary"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                  >
                    📝 {t('nav.vocabulary')}
                  </button>
                  <button
                    onClick={() => navigate("/clipboard")}
                    aria-label={t('nav.clipboardPageAria')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === "stats"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                  >
                    📋 {t('nav.clipboard')}
                  </button>
                  <button
                    onClick={() => navigate("/jlpt-tests")}
                    aria-label={t('nav.jlptTestsPageAria') || 'JLPT Tests Page'}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === "jlpt"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                  >
                    📝 Test
                  </button>
                </nav>
                {isSignedIn ? (
                  <SignOutButton className="px-3 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100" />
                ) : (
                  <button
                    onClick={() => {
                      if (window.confirm("Clear offline data and exit?")) {
                        localStorage.removeItem('prOfflineBooks');
                        window.location.reload();
                      }
                    }}
                    className="px-3 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100"
                  >
                    Exit Offline Mode
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={onShowLogin}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {t('nav.signIn')}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

