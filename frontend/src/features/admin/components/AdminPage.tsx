import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { appLog } from "@shared/appLog";
import { useAppDeps } from "@app/deps/AppDepsProvider";

type KanjiInfo = {
  kanji: string;
  meanings: string[];
  kun_readings: string[];
  on_readings: string[];
  jlpt?: number;
};

export function AdminPage() {
  const deps = useAppDeps();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [keys, setKeys] = useState<string[]>([]);
  const [unauthorized, setUnauthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Kanji management state
  const [kanjiQuery, setKanjiQuery] = useState("");
  const [kanjiResults, setKanjiResults] = useState<KanjiInfo[]>([]);
  const [selectedKanji, setSelectedKanji] = useState<KanjiInfo | null>(null);
  const [kanjiLoading, setKanjiLoading] = useState(false);

  async function loadKeys() {
    setIsLoading(true);
    let data;
    try { data = await deps.backend.admin.listOpenAiKeys(); }
    catch { setUnauthorized(true); setIsLoading(false); return; }
    if (data === null) {
      setUnauthorized(true);
      setIsLoading(false);
      return;
    }
    setKeys(data.keys || []);
    setUnauthorized(false);
    setIsLoading(false);
  }

  useEffect(() => {
    loadKeys();
  }, []);

  // Show loading state while checking permissions
  if (isLoading) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">{t('admin.loading.checking')}</span>
        </div>
      </div>
    );
  }

  // Show access denied page for unauthorized users
  if (unauthorized) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">{t('admin.unauthorized.title')}</h1>
          <p className="text-red-600 mb-6">{t('admin.unauthorized.message')}</p>
          <p className="text-gray-600 mb-8">{t('admin.unauthorized.message2')}</p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('admin.unauthorized.back')}
          </button>
        </div>
      </div>
    );
  }

  // Kanji management functions
  async function searchKanji() {
    if (!kanjiQuery.trim()) return;
    
    setKanjiLoading(true);
    try {
      const data = await deps.backend.admin.searchKanji({ query: kanjiQuery.trim() });
      const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
      setKanjiResults(results as KanjiInfo[]);
    } catch (error) {
      appLog.error("[AdminPage] Error searching kanji", error);
      setKanjiResults([]);
    } finally {
      setKanjiLoading(false);
    }
  }

  // Only render admin interface for authorized users
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t('admin.header')}</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* OpenAI Key Management */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">{t('admin.keys.title')}</h2>
          
          <p role="status">API credentials are managed through deployment settings. Server-funded AI is disabled.</p>
          <div>
            <h3 className="font-medium mb-2">{t('admin.keys.current', { count: keys.length })}</h3>
            {keys.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('admin.keys.none')}</p>
            ) : (
              <ul className="space-y-2">
                {keys.map((k) => (
                  <li
                    key={k}
                    className="flex items-center justify-between border p-2 rounded"
                  >
                    <span className="font-mono text-sm">{k}</span>

                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Kanji Management */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">{t('admin.kanji.title')}</h2>
          
          {/* Search Section */}
          <div>
            <label className="block font-medium mb-2">{t('admin.kanji.searchLabel')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={kanjiQuery}
                onChange={(e) => setKanjiQuery(e.target.value)}
                className="border rounded flex-1 p-2 bg-white text-gray-900 border-gray-300"
                placeholder={t('admin.kanji.placeholder')}
                onKeyPress={(e) => e.key === 'Enter' && searchKanji()}
              />
              <button
                onClick={searchKanji}
                disabled={kanjiLoading}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {kanjiLoading ? "..." : t('admin.kanji.search')}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {kanjiResults.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">{t('admin.kanji.results')}</h3>
              <div className="max-h-48 overflow-y-auto border rounded">
                {kanjiResults.map((kanji) => (
                  <div
                    key={kanji.kanji}
                    className={`p-3 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedKanji?.kanji === kanji.kanji ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                    onClick={() => {
                      setSelectedKanji(kanji);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xl font-bold mr-2">{kanji.kanji}</span>
                        <span className="text-sm text-gray-600">
                          {kanji.meanings.slice(0, 3).join(', ')}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        kanji.jlpt ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {kanji.jlpt ? `N${kanji.jlpt}` : t('admin.kanji.noJlpt')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Section */}
          {selectedKanji && (
            <div className="border rounded p-4 bg-gray-50">
              <h3 className="font-medium mb-3 text-gray-900">{t('admin.kanji.editTitle', { kanji: selectedKanji.kanji })}</h3>
              
              <div className="mb-3 text-sm text-gray-800">
                <div><strong>{t('admin.kanji.meanings')}</strong> {selectedKanji.meanings.join(', ')}</div>
                <div><strong>{t('admin.kanji.kun')}</strong> {selectedKanji.kun_readings.join(', ')}</div>
                <div><strong>{t('admin.kanji.on')}</strong> {selectedKanji.on_readings.join(', ')}</div>
                <div><strong>{t('admin.kanji.currentJlpt')}</strong> {selectedKanji.jlpt ? `N${selectedKanji.jlpt}` : t('admin.kanji.none')}</div>
              </div>

              <p>Dictionary editing is unavailable until shared overrides are supported.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
