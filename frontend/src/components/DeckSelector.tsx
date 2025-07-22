import { useState } from "react";
import { toast } from "sonner";

interface Deck {
  id: string;
  name: string;
  word_count: number;
}

interface DeckSelectorProps {
  onDeckSelect?: (deck: Deck) => void;
  selectedDeckId?: string;
}

export function DeckSelector({ onDeckSelect, selectedDeckId }: DeckSelectorProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchDecks = async () => {
    setIsLoading(true);
    try {
      // Get JPDB credentials from localStorage
      const jpdbUsername = localStorage.getItem('jpdbUsername') || '';
      const jpdbPassword = localStorage.getItem('jpdbPassword') || '';
      const jpdbCookie = localStorage.getItem('jpdbCookie') || '';

      if (!jpdbUsername && !jpdbPassword && !jpdbCookie) {
        toast.error('JPDB credentials not configured. Please check settings.');
        return;
      }

      const response = await fetch('/api/list-user-decks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: jpdbUsername,
          password: jpdbPassword,
          cookie: jpdbCookie,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch decks');
      }

      const fetchedDecks = await response.json();
      setDecks(fetchedDecks);
      setIsOpen(true);
      toast.success(`Found ${fetchedDecks.length} decks`);
    } catch (error: any) {
      console.error('Error fetching decks:', error);
      if (error.message.includes('401') || error.message.includes('Authentication')) {
        toast.error('JPDB authentication failed. Please check your credentials in settings.');
      } else {
        toast.error('Failed to fetch decks. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeckSelect = (deck: Deck) => {
    onDeckSelect?.(deck);
    setIsOpen(false);
    toast.success(`Selected deck: ${deck.name}`);
  };

  const selectedDeck = decks.find(deck => deck.id === selectedDeckId);

  return (
    <div className="relative">
      {/* Deck Selector Box */}
      <div 
        onClick={fetchDecks}
        className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
      >
        <div className="flex items-center justify-center space-x-3">
          <div className="text-2xl">🗂️</div>
          <div className="text-center">
            {selectedDeck ? (
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {selectedDeck.name}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedDeck.word_count.toLocaleString()} words
                </div>
              </div>
            ) : (
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  Select JPDB Deck
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Click to view your vocabulary decks
                </div>
              </div>
            )}
          </div>
          {isLoading && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          )}
        </div>
      </div>

      {/* Deck List Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900 dark:text-white">
                Your JPDB Decks ({decks.length})
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
          </div>
          
          {decks.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              No decks found
            </div>
          ) : (
            <div className="p-2">
              {decks.map((deck) => (
                <div
                  key={deck.id}
                  onClick={() => handleDeckSelect(deck)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    deck.id === selectedDeckId
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {deck.name}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        ID: {deck.id}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {deck.word_count.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        words
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 