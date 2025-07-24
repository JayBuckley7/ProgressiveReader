import { SignedIn, SignedOut, SignOutButton } from "@clerk/clerk-react";
// import { SignOutButton } from "./SignOutButton"; // REMOVED - using Clerk's
import { useState } from "react";

interface TopActionsProps {
  currentPage: "library" | "vocabulary" | "stats" | "admin";
  onShowLogin?: () => void;
}

import { useNavigate } from "react-router-dom";

export function TopActions({ currentPage, onShowLogin }: TopActionsProps) {
  const navigate = useNavigate();
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
        {/* Mobile Layout */}
        <div className="flex justify-between items-center sm:hidden">
          <button
            onClick={() => navigate("/")}
            className="flex items-center"
          >
            <img src="/icon.png" alt="App icon" className="w-5 h-5 mr-1.5" />
            <span className="text-sm font-bold text-gray-900">ProgReader</span>
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
            <SignedIn>
              <button
                onClick={() => { navigate("/"); setShowMobileMenu(false); }}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  currentPage === "library" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                }`}
              >
                📚 Library
              </button>
              <button
                onClick={() => { navigate("/vocabulary"); setShowMobileMenu(false); }}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  currentPage === "vocabulary" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                }`}
              >
                📝 Vocabulary
              </button>
              <button
                onClick={() => { navigate("/stats"); setShowMobileMenu(false); }}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  currentPage === "stats" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                }`}
              >
                📊 Stats
              </button>
              <button
                onClick={() => { navigate("/admin"); setShowMobileMenu(false); }}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  currentPage === "admin" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                }`}
              >
                ⚙️ Admin
              </button>
              <div className="pt-2 border-t">
                <SignOutButton className="w-full text-left px-3 py-2 text-gray-600 rounded text-sm hover:bg-gray-100" />
              </div>
            </SignedIn>
            <SignedOut>
              {onShowLogin && (
                <button
                  onClick={() => { onShowLogin(); setShowMobileMenu(false); }}
                  className="w-full text-left px-3 py-2 bg-blue-600 text-white rounded text-sm"
                >
                  📧 Sign in
                </button>
              )}
            </SignedOut>
          </div>
        )}

        {/* Desktop Layout */}
        <div className="hidden sm:flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/")}
              aria-label="Go to library"
              className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors flex items-center"
            >
              <img src="/icon.png" alt="App icon" className="w-6 h-6 mr-2" />
              Progressive Reader
            </button>
            
          </div>
          
          <div className="flex items-center space-x-4">
            <SignedIn>
              <nav className="flex items-center space-x-1">
                <button
                  onClick={() => navigate("/")}
                  aria-label="Library page"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === "library"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  📚 Library
                </button>
                <button
                  onClick={() => navigate("/vocabulary")}
                  aria-label="Vocabulary page"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === "vocabulary"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  📝 Vocabulary
                </button>
                <button
                  onClick={() => navigate("/stats")}
                  aria-label="Statistics page"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === "stats"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  📊 Stats
                </button>
                <button
                  onClick={() => navigate("/admin")}
                  aria-label="Admin page"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === "admin"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  ⚙️ Admin
                </button>
              </nav>
              <SignOutButton className="px-3 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100" />
            </SignedIn>
            
            <SignedOut>
              {/* No sign-in button in desktop nav - users can see the main form below */}
            </SignedOut>
          </div>
        </div>
      </div>

    </header>
  );
}
