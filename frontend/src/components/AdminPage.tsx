import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthHeaders } from "../utils/auth";

interface KanjiInfo {
  kanji: string;
  meanings: string[];
  kun_readings: string[];
  on_readings: string[];
  jlpt?: number;
  stroke_count?: number;
  grade?: number;
}

export function AdminPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Kanji management state
  const [kanjiQuery, setKanjiQuery] = useState("");
  const [kanjiResults, setKanjiResults] = useState<KanjiInfo[]>([]);
  const [selectedKanji, setSelectedKanji] = useState<KanjiInfo | null>(null);
  const [newJlptLevel, setNewJlptLevel] = useState<number | null>(null);
  const [kanjiLoading, setKanjiLoading] = useState(false);

  async function loadKeys() {
    setIsLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/openai_keys", { headers });
    if (res.status === 403) {
      setUnauthorized(true);
      setIsLoading(false);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys || []);
      setUnauthorized(false);
    }
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
          <span className="ml-3 text-gray-600">Checking admin permissions...</span>
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
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h1>
          <p className="text-red-600 mb-6">You do not have admin privileges to access this page.</p>
          <p className="text-gray-600 mb-8">
            Only administrators can manage API keys and system settings.
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to Library
          </button>
        </div>
      </div>
    );
  }

  async function addKey() {
    const trimmed = newKey.trim();
    if (!trimmed) return;
    const headers = await getAuthHeaders();
    const res = await fetch("/api/openai_keys/add", {
      method: "POST",
      headers,
      body: JSON.stringify({ key: trimmed }),
    });
    if (res.ok) {
      setNewKey("");
      loadKeys();
    }
  }

  async function removeKey(key: string) {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/openai_keys/remove", {
      method: "POST",
      headers,
      body: JSON.stringify({ key }),
    });
    if (res.ok) {
      loadKeys();
    }
  }

  // Kanji management functions
  async function searchKanji() {
    if (!kanjiQuery.trim()) return;
    
    setKanjiLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const headers = {
        ...authHeaders,
        'Content-Type': 'application/json',
      };
      
      const res = await fetch("/api/kanji/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: kanjiQuery.trim() }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setKanjiResults(data.results || []);
      } else {
        const errorText = await res.text();
        console.error("Failed to search kanji:", res.status, errorText);
        setKanjiResults([]);
      }
    } catch (error) {
      console.error("Error searching kanji:", error);
      setKanjiResults([]);
    } finally {
      setKanjiLoading(false);
    }
  }

  async function updateKanjiJlpt() {
    if (!selectedKanji) return;
    
    setKanjiLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const headers = {
        ...authHeaders,
        'Content-Type': 'application/json',
      };
      
      const res = await fetch("/api/kanji/update", {
        method: "POST",
        headers,
        body: JSON.stringify({
          kanji: selectedKanji.kanji,
          jlpt_level: newJlptLevel,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log(`Updated ${data.kanji} from N${data.old_jlpt || 'None'} to N${data.new_jlpt || 'None'}`);
        
        // Update the selected kanji and results
        const updatedKanji = { ...selectedKanji, jlpt: newJlptLevel };
        setSelectedKanji(updatedKanji);
        setKanjiResults(prev => 
          prev.map(k => k.kanji === selectedKanji.kanji ? updatedKanji : k)
        );
        setNewJlptLevel(null);
      } else {
        const errorText = await res.text();
        console.error("Failed to update kanji:", res.status, errorText);
      }
    } catch (error) {
      console.error("Error updating kanji:", error);
    } finally {
      setKanjiLoading(false);
    }
  }

  // Only render admin interface for authorized users
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* OpenAI Key Management */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">🔑 OpenAI API Keys</h2>
          
          <div>
            <label className="block font-medium mb-2">Add OpenAI API Key</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="border rounded w-full p-2 mb-2 bg-white text-gray-900 border-gray-300"
              placeholder="sk-..."
            />
            <button
              onClick={addKey}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Add Key
            </button>
          </div>
          
          <div>
            <h3 className="font-medium mb-2">Current Keys ({keys.length})</h3>
            {keys.length === 0 ? (
              <p className="text-gray-500 text-sm">No API keys configured</p>
            ) : (
              <ul className="space-y-2">
                {keys.map((k) => (
                  <li
                    key={k}
                    className="flex items-center justify-between border p-2 rounded"
                  >
                    <span className="font-mono text-sm">{k.slice(0, 8)}...</span>
                    <button
                      onClick={() => removeKey(k)}
                      className="text-red-600 text-sm hover:text-red-800 transition-colors"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Kanji Management */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">🔥 Kanji JLPT Level Editor</h2>
          
          {/* Search Section */}
          <div>
            <label className="block font-medium mb-2">Search Kanji</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={kanjiQuery}
                onChange={(e) => setKanjiQuery(e.target.value)}
                className="border rounded flex-1 p-2 bg-white text-gray-900 border-gray-300"
                placeholder="Enter kanji or meaning (e.g., 誰 or 'who')"
                onKeyPress={(e) => e.key === 'Enter' && searchKanji()}
              />
              <button
                onClick={searchKanji}
                disabled={kanjiLoading}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {kanjiLoading ? "..." : "Search"}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {kanjiResults.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Search Results</h3>
              <div className="max-h-48 overflow-y-auto border rounded">
                {kanjiResults.map((kanji) => (
                  <div
                    key={kanji.kanji}
                    className={`p-3 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedKanji?.kanji === kanji.kanji ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                    onClick={() => {
                      setSelectedKanji(kanji);
                      setNewJlptLevel(kanji.jlpt || null);
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
                        {kanji.jlpt ? `N${kanji.jlpt}` : 'No JLPT'}
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
              <h3 className="font-medium mb-3 text-gray-900">Edit Kanji: {selectedKanji.kanji}</h3>
              
              <div className="mb-3 text-sm text-gray-800">
                <div><strong>Meanings:</strong> {selectedKanji.meanings.join(', ')}</div>
                <div><strong>Kun:</strong> {selectedKanji.kun_readings.join(', ')}</div>
                <div><strong>On:</strong> {selectedKanji.on_readings.join(', ')}</div>
                <div><strong>Current JLPT:</strong> {selectedKanji.jlpt ? `N${selectedKanji.jlpt}` : 'None'}</div>
              </div>

              <div className="flex items-center gap-2">
                <label className="font-medium text-gray-900">New JLPT Level:</label>
                <select
                  value={newJlptLevel || ''}
                  onChange={(e) => setNewJlptLevel(e.target.value ? parseInt(e.target.value) : null)}
                  className="border rounded p-1 bg-white text-gray-900 border-gray-300"
                >
                  <option value="">None</option>
                  <option value="1">N1</option>
                  <option value="2">N2</option>
                  <option value="3">N3</option>
                  <option value="4">N4</option>
                  <option value="5">N5</option>
                </select>
                
                <button
                  onClick={updateKanjiJlpt}
                  disabled={kanjiLoading || newJlptLevel === selectedKanji.jlpt}
                  className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                  {kanjiLoading ? "..." : "Update"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
