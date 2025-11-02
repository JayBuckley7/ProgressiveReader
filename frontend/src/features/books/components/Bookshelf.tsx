import { useAppData } from "@shared/contexts/AppDataContext";
import { BookCard } from "./BookCard";

export function Bookshelf() {
  const { books } = useAppData();

  if (books.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-block relative mb-6">
          <img src="/static/icons/slow.gif" alt="Animation" className="w-16 h-16 mb-4 rounded-lg shadow" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Your bookshelf reimagined</h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Learn languages through reading with intelligent vocabulary tracking and progress analytics
        </p>
        
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
          <div className="bg-white rounded-lg border p-6 shadow-sm">
            <div className="text-4xl mb-4">📖</div>
            <h3 className="font-semibold text-lg mb-2">Smart Reading</h3>
            <p className="text-gray-600 text-sm">
              Upload EPUB, PDF, MOBI, or TXT files and read with built-in language learning tools
            </p>
          </div>
          <div className="bg-white rounded-lg border p-6 shadow-sm">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="font-semibold text-lg mb-2">Vocabulary Tracking</h3>
            <p className="text-gray-600 text-sm">
              Save and review new words with context and translations as you read
            </p>
          </div>
          <div className="bg-white rounded-lg border p-6 shadow-sm">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="font-semibold text-lg mb-2">Progress Analytics</h3>
            <p className="text-gray-600 text-sm">
              Track your reading progress and vocabulary growth over time
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 max-w-md mx-auto">
          <h3 className="font-semibold text-blue-900 mb-4 text-lg">Getting Started</h3>
          <ul className="text-sm text-blue-800 space-y-2 text-left">
            <li className="flex items-center">
              <span className="w-2 h-2 bg-blue-600 rounded-full mr-3"></span>
              Click "Upload Book" to add your first book
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-blue-600 rounded-full mr-3"></span>
              Supported formats: EPUB, PDF, MOBI, TXT
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-blue-600 rounded-full mr-3"></span>
              Track vocabulary and reading progress
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-blue-600 rounded-full mr-3"></span>
              Learn languages through immersion
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Library</h1>
          <p className="text-gray-600">{books.length} book{books.length !== 1 ? 's' : ''} in your collection</p>
        </div>
        <div className="flex space-x-2">
          <button className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium">
            All Books
          </button>
          <button className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            Reading
          </button>
          <button className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            Completed
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {books.map((book) => (
          <BookCard key={book._id} book={book} />
        ))}
      </div>
    </div>
  );
}

