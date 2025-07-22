import { SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useAppData } from "../contexts/AppDataContext";
import { authManager } from "../services/authManager";
import { vocabBank } from "../services/vocabBank";

export function HeroBanner() {
  const { user, isSignedIn, isLoaded } = useUser();
  // Pull the user's library from the storage service so counts reflect
  // the current library after Drive sync completes.
  const { books } = useAppData();

  const [stats, setStats] = useState({ saved: 0, mastered: 0 });

  useEffect(() => {
    // Only load vocabulary if user is authenticated with Clerk
    if (isLoaded && isSignedIn) {
      // Wait for the centralized auth manager to confirm authentication
      // instead of immediately calling vocabBank.load()
      let hasLoaded = false;
      const unsubscribe = authManager.onAuthStateChange((isAuthenticated) => {
        if (isAuthenticated && !hasLoaded) {
          hasLoaded = true;
          vocabBank.load().then(() => {
            setStats(vocabBank.getStats());
          });
        }
      });
      
      return unsubscribe;
    }
  }, [isLoaded, isSignedIn]);

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <SignedIn>
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">
              Welcome back, {user?.firstName || user?.username || "Reader"}! 📖
            </h1>
            <p className="text-xl text-blue-100 mb-6">
              Continue your language learning journey
            </p>
            <div className="flex justify-center space-x-8 text-center">
              <div>
                <div className="text-3xl font-bold">{books.length}</div>
                <div className="text-blue-200">Books</div>
              </div>
              <div>
                <div className="text-3xl font-bold">{stats.saved}</div>
                <div className="text-blue-200">Words Saved</div>
              </div>
              <div>
                <div className="text-3xl font-bold">{stats.mastered}</div>
                <div className="text-blue-200">Words Mastered</div>
              </div>
            </div>
          </div>
        </SignedIn>
        
        <SignedOut>
          <div className="text-center">
            
          <img src="/slow.gif" alt="Animation" className="w-16 h-16 mb-4 rounded-lg shadow mx-auto" />
            <h1 className="text-5xl font-bold mb-4 flex items-center justify-center">
              Your Digital Bookshelf, Reimagined.
            </h1>
            <p className="text-xl text-blue-100 mb-8">
              Upload books in EPUB, PDF, MOBI, DOCX, or TXT format, read anywhere, and enhance your language learning.
            </p>
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <div className="text-3xl mb-3">📖</div>
                <h3 className="font-semibold mb-2">Smart Reading</h3>
                <p className="text-blue-100 text-sm">
                  Upload your books and read with built-in language learning tools
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <div className="text-3xl mb-3">📝</div>
                <h3 className="font-semibold mb-2">Vocabulary Tracking</h3>
                <p className="text-blue-100 text-sm">
                  Save and review new words with context and translations
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <div className="text-3xl mb-3">📊</div>
                <h3 className="font-semibold mb-2">Progress Analytics</h3>
                <p className="text-blue-100 text-sm">
                  Track your reading progress and vocabulary growth
                </p>
              </div>
            </div>
          </div>
        </SignedOut>
      </div>
    </div>
  );
}
