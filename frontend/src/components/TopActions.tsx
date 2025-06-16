import { useState } from "react";
import { DriveButton } from "../gdrive/DriveButton";

interface TopActionsProps {
  currentPage: "library" | "vocabulary" | "stats";
  onPageChange: (page: "library" | "vocabulary" | "stats") => void;
}

export function TopActions({ currentPage, onPageChange }: TopActionsProps) {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
        {/* Mobile Layout */}
        <div className="flex justify-between items-center sm:hidden">
          <button onClick={() => onPageChange("library")} className="flex items-center">
            <img src="/icon.png" alt="App icon" className="w-5 h-5 mr-1.5" />
            <span className="text-sm font-bold text-gray-900">ProgReader</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="p-1.5 text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showMobileMenu ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {showMobileMenu && (
          <div className="sm:hidden mt-2 py-2 space-y-1">
            <button
              onClick={() => { onPageChange("library"); setShowMobileMenu(false); }}
              className={`w-full text-left px-3 py-2 rounded text-sm ${currentPage === "library" ? "bg-blue-100 text-blue-700" : "text-gray-600"}`}
            >
              📚 Library
            </button>
            <button
              onClick={() => { onPageChange("vocabulary"); setShowMobileMenu(false); }}
              className={`w-full text-left px-3 py-2 rounded text-sm ${currentPage === "vocabulary" ? "bg-blue-100 text-blue-700" : "text-gray-600"}`}
            >
              📝 Vocabulary
            </button>
            <button
              onClick={() => { onPageChange("stats"); setShowMobileMenu(false); }}
              className={`w-full text-left px-3 py-2 rounded text-sm ${currentPage === "stats" ? "bg-blue-100 text-blue-700" : "text-gray-600"}`}
            >
              📊 Stats
            </button>
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
          </div>

          <div className="flex items-center space-x-4">
            <nav className="flex items-center space-x-1">
              <button
                onClick={() => onPageChange("library")}
                aria-label="Library page"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === "library" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
              >
                📚 Library
              </button>
              <button
                onClick={() => onPageChange("vocabulary")}
                aria-label="Vocabulary page"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === "vocabulary" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
              >
                📝 Vocabulary
              </button>
              <button
                onClick={() => onPageChange("stats")}
                aria-label="Statistics page"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === "stats" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
              >
                📊 Stats
              </button>
            </nav>
            <DriveButton />
          </div>
        </div>
      </div>
    </header>
  );
}
