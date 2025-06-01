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

  return (
    <header className="bg-white shadow-sm border-b sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => onPageChange("library")}
            className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            📚 Progressive Reader
          </button>
          <button
            onClick={() => setShowAddBook(true)}
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
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === "stats" 
                    ? "bg-blue-100 text-blue-700" 
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                📊 Stats
              </button>
            </nav>
            <DriveButton />
            <SignOutButton />
          </Authenticated>

          <Unauthenticated>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Sign in with:</span>
              <button
                onClick={onShowLogin}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                📧 Email
              </button>
            </div>
          </Unauthenticated>
        </div>
      </div>
      
      {showAddBook && (
        <AddBookModal onClose={() => setShowAddBook(false)} />
      )}
    </header>
  );
}
