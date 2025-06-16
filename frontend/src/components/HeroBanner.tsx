export function HeroBanner() {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white">
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
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
    </div>
  );
}
