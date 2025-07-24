import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthHeaders } from "../utils/auth";

export function AdminPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  // Only render admin interface for authorized users
  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
      <div className="mb-6">
        <label className="block font-medium mb-2">Add OpenAI API Key</label>
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="border rounded w-full p-2 mb-2"
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
        <h2 className="font-medium mb-2">Current Keys ({keys.length})</h2>
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
  );
}
