import { Authenticated, Unauthenticated } from "convex/react";
import { SignOutButton } from "../SignOutButton";
import { useState } from "react";
import { AddBookModal } from "./AddBookModal";
import { DriveButton } from "../gdrive/DriveButton";

interface TopActionsProps {
  currentPage: "library" | "vocabulary" | "stats";
  onPageChange: (page: "library" | "vocabulary" | "stats") => void;
  onShowLogin: () => void;
}

export function TopActions({ currentPage, onPageChange, onShowLogin }: TopActionsProps) {
  const [showAddBook, setShowAddBook] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
        {/* Mobile Layout */}
        <div className="flex justify-between items-center sm:hidden">
          <button
            onClick={() => onPageChange("library")}
            className="flex items-center"
          >
            <img src="/icon.png" alt="App icon" className="w-5 h-5 mr-1.5" />
            <span className="text-sm font-bold text-gray-900">ProgReader</span>
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddBook(true)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium"
            >
              + Upload
            </button>
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
            <Authenticated>
              <button
                onClick={() => { onPageChange("library"); setShowMobileMenu(false); }}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  currentPage === "library" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                }`}
              >
                📚 Library
              </button>
              <button
                onClick={() => { onPageChange("vocabulary"); setShowMobileMenu(false); }}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  currentPage === "vocabulary" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                }`}
              >
                📝 Vocabulary
              </button>
              <button
                onClick={() => { onPageChange("stats"); setShowMobileMenu(false); }}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  currentPage === "stats" ? "bg-blue-100 text-blue-700" : "text-gray-600"
                }`}
              >
                📊 Stats
              </button>
              <div className="pt-2 border-t">
                <SignOutButton />
              </div>
            </Authenticated>
            <Unauthenticated>
              <button
                onClick={onShowLogin}
                className="w-full text-left px-3 py-2 bg-blue-600 text-white rounded text-sm"
              >
                📧 Sign in with Email
              </button>
            </Unauthenticated>
          </div>
        )}

        {/* Desktop Layout */}
        <div className="hidden sm:flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => onPageChange("library")}
              aria-label="Go to library"
              className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors flex items-center"
            >
              <img src="/icon.png" alt="App icon" className="w-6 h-6 mr-2" />
              Progressive Reader
            </button>
            <button
              onClick={() => setShowAddBook(true)}
              aria-label="Upload book"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              + Upload Book
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            <Authenticated>
              <nav className="flex items-center space-x-1">
                <button
                  onClick={() => onPageChange("library")}
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
                  onClick={() => onPageChange("vocabulary")}
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
                  onClick={() => onPageChange("stats")}
                  aria-label="Statistics page"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === "stats"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  📊 Stats
                </button>
              </nav>
              <SignOutButton />
            </Authenticated>
            
            <Unauthenticated>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Sign in with:</span>
                <button
                  onClick={onShowLogin}
                  aria-label="Sign in with email"
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  📧 Email
                </button>
                <button
                  onClick={() => window.open('https://accounts.google.com/oauth/authorize?client_id=your-client-id&redirect_uri=your-redirect&scope=https://www.googleapis.com/auth/drive.readonly&response_type=code', '_blank')}
                  aria-label="Connect Google Drive"
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  📁 Google Drive
                </button>
              </div>
            </Unauthenticated>
          </div>
        </div>
      </div>
      
      {showAddBook && (
        <AddBookModal onClose={() => setShowAddBook(false)} />
      )}
    </header>
  );
}
