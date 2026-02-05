import { SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "@shared/contexts/AppDataContext";
import { authManager } from "@shared/services/authManager";
import { vocabBank } from "@features/vocabulary/services/vocabBank";

export function HeroBanner() {
  const { user, isSignedIn, isLoaded } = useUser();
  // Pull the user's library from the storage service so counts reflect
  // the current library after Drive sync completes.
  const { books } = useAppData();
  const { t } = useTranslation();

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
    <div className="app-hero">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <SignedIn>
          <div>
            <h1 className="text-base sm:text-lg font-medium">
              {t("hero.signedIn.welcome", {
                name: user?.firstName || user?.username || t("hero.defaultName"),
              })}
            </h1>
            <p className="text-sm mt-1 max-w-2xl app-hero-subtle">
              {t("hero.signedIn.journey")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs app-hero-subtle">
              <span>
                {t("hero.signedIn.stats.books")}: <strong>{books.length}</strong>
              </span>
              <span>
                {t("hero.signedIn.stats.wordsSaved")}: <strong>{stats.saved}</strong>
              </span>
              <span>
                {t("hero.signedIn.stats.wordsMastered")}: <strong>{stats.mastered}</strong>
              </span>
            </div>
          </div>
        </SignedIn>

        <SignedOut>
          <div>
            <h1 className="text-base sm:text-lg font-medium">
              {t("hero.signedOut.title")}
            </h1>
            <p className="text-sm mt-1 max-w-2xl app-hero-subtle">
              {t("hero.signedOut.description")}
            </p>
            <div className="mt-1 text-xs app-hero-subtle">
              {t("hero.signedOut.features.smartReading.title")} •{" "}
              {t("hero.signedOut.features.vocabTracking.title")} •{" "}
              {t("hero.signedOut.features.analytics.title")}
            </div>
          </div>
        </SignedOut>
      </div>
    </div>
  );
}
