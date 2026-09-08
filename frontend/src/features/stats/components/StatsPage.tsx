import { lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

const VocabularyPage = lazy(() => import("@features/vocabulary/components/VocabularyPage"));
const GrammarPage = lazy(() => import("@features/grammar/components/GrammarPage"));

export default function StatsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const isGrammar = params.get("view") === "grammar";

  return <div className="max-w-6xl mx-auto w-full px-4 py-8">
    <h1 className="text-3xl font-bold">{t("nav.stats")}</h1>
    <p className="mt-2 text-sm app-muted">{t("stats.subtitle")}</p>
    <nav aria-label={t("stats.sections")} className="mt-6 mb-6 flex gap-2 border-b app-border pb-3">
      <Link to="/stats" aria-current={!isGrammar ? "page" : undefined}
        className={`app-nav-item rounded-md px-4 py-2 text-sm font-medium ${!isGrammar ? "app-nav-active" : ""}`}>
        {t("nav.vocabulary")}
      </Link>
      <Link to="/stats?view=grammar" aria-current={isGrammar ? "page" : undefined}
        className={`app-nav-item rounded-md px-4 py-2 text-sm font-medium ${isGrammar ? "app-nav-active" : ""}`}>
        {t("nav.grammar")}
      </Link>
    </nav>
    <Suspense fallback={<p role="status" className="app-muted py-6">{t("stats.loading")}</p>}>
      {isGrammar ? <GrammarPage embedded /> : <VocabularyPage embedded />}
    </Suspense>
  </div>;
}
