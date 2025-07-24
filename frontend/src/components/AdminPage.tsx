import { useEffect, useState } from "react";
import { getAuthHeaders } from "../utils/auth";

export function AdminPage() {
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState("");

  async function loadKeys() {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/openai_keys", { headers });
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys || []);
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

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
        />
        <button
          onClick={addKey}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Add Key
        </button>
      </div>
      <div>
        <h2 className="font-medium mb-2">Current Keys</h2>
        <ul className="space-y-2">
          {keys.map((k) => (
            <li
              key={k}
              className="flex items-center justify-between border p-2 rounded"
            >
              <span>{k.slice(0, 8)}...</span>
              <button
                onClick={() => removeKey(k)}
                className="text-red-600 text-sm"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
