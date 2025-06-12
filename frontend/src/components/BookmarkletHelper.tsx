import React, { useState } from 'react';
import { toast } from 'sonner';

interface BookmarkletHelperProps {
  onCookieExtracted: (cookie: string) => void;
  onClose: () => void;
}

export function BookmarkletHelper({ onCookieExtracted, onClose }: BookmarkletHelperProps) {
  const [step, setStep] = useState<'setup' | 'waiting' | 'manual'>('setup');

  // The bookmarklet code that will run on JPDB
  const bookmarkletCode = `
javascript:(function(){
  try {
    // Extract JPDB session cookie
    const cookies = document.cookie.split(';');
    let sidCookie = '';
    
    for (let cookie of cookies) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith('sid=')) {
        sidCookie = trimmed;
        break;
      }
    }
    
    if (!sidCookie) {
      alert('❌ JPDB session cookie not found!\\n\\nPlease make sure you are:\\n1. Logged in to JPDB\\n2. On the jpdb.io domain\\n3. Have a valid session');
      return;
    }
    
    // Send cookie to our app
    const appUrl = '${window.location.origin}';
    const cookieData = encodeURIComponent(sidCookie);
    
    // Try to communicate with the parent app
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'JPDB_COOKIE_EXTRACTED',
        cookie: sidCookie
      }, appUrl);
      alert('✅ Cookie extracted successfully!\\n\\nYou can now close this tab and return to the app.');
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(sidCookie).then(() => {
        alert('✅ Cookie copied to clipboard!\\n\\nCookie: ' + sidCookie + '\\n\\nReturn to the app and paste it when prompted.');
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = sidCookie;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('✅ Cookie copied to clipboard!\\n\\nCookie: ' + sidCookie + '\\n\\nReturn to the app and paste it when prompted.');
      });
    }
  } catch (error) {
    alert('❌ Error extracting cookie: ' + error.message + '\\n\\nPlease try the manual method instead.');
  }
})();
  `.trim();

  const bookmarkletUrl = bookmarkletCode.replace(/\s+/g, ' ');

  // Listen for messages from the bookmarklet
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'JPDB_COOKIE_EXTRACTED') {
        const cookie = event.data.cookie;
        toast.success('Cookie extracted successfully!');
        onCookieExtracted(cookie);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onCookieExtracted]);

  const handleSetupBookmarklet = () => {
    setStep('waiting');
    // Open JPDB in a new tab for the user to test the bookmarklet
    window.open('https://jpdb.io/login', '_blank');
  };

  const handleManualFallback = () => {
    setStep('manual');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const cookie = formData.get('cookie') as string;
    
    if (cookie && cookie.trim()) {
      const formattedCookie = cookie.startsWith('sid=') ? cookie.trim() : `sid=${cookie.trim()}`;
      onCookieExtracted(formattedCookie);
    } else {
      toast.error('Please enter a valid cookie');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">🔖 JPDB Cookie Extractor</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {step === 'setup' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                📋 One-Click Cookie Extraction
              </h3>
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                This bookmarklet will automatically extract your JPDB session cookie when you click it on the JPDB website.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold">Step 1: Add the Bookmarklet</h4>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                <p className="text-sm mb-2">Copy this bookmarklet code:</p>
                <div className="bg-white dark:bg-gray-800 border rounded p-2 mb-2 relative">
                  <code className="text-xs break-all select-all pr-16">{bookmarkletUrl}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(bookmarkletUrl);
                      toast.success('Bookmarklet code copied!');
                    }}
                    className="absolute top-1 right-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <p><strong>To create the bookmarklet:</strong></p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Copy the code above (click and Ctrl+A, then Ctrl+C)</li>
                    <li>Right-click your bookmarks bar → "Add page" or "New bookmark"</li>
                    <li>Name: "Extract JPDB Cookie"</li>
                    <li>URL: Paste the code you copied</li>
                    <li>Save the bookmark</li>
                  </ol>
                </div>
              </div>

              <h4 className="font-semibold">Step 2: Use the Bookmarklet</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Click the button below to open JPDB</li>
                <li>Log in to your JPDB account</li>
                <li>Click the bookmarklet you just added</li>
                <li>The cookie will be automatically extracted!</li>
              </ol>

              <div className="flex gap-3">
                <button
                  onClick={handleSetupBookmarklet}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                >
                  🚀 Open JPDB & Start
                </button>
                <button
                  onClick={handleManualFallback}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  📝 Manual Method Instead
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'waiting' && (
          <div className="space-y-4 text-center">
            <div className="text-6xl">⏳</div>
            <h3 className="text-lg font-semibold">Waiting for Cookie...</h3>
            <p className="text-gray-600 dark:text-gray-400">
              1. Log in to JPDB in the new tab<br/>
              2. Click the "Extract JPDB Cookie" bookmarklet<br/>
              3. The cookie will be automatically sent back here
            </p>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                <strong>Don't see the bookmarklet?</strong><br/>
                Make sure you dragged the "Extract JPDB Cookie" button to your bookmarks bar first!
              </p>
            </div>

            <button
              onClick={handleManualFallback}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              📝 Switch to Manual Method
            </button>
          </div>
        )}

        {step === 'manual' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">📝 Manual Cookie Extraction</h3>
            
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold">Instructions:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Open JPDB and log in</li>
                <li>Press F12 to open Developer Tools</li>
                <li>Go to: Application tab → Storage → Cookies → https://jpdb.io</li>
                <li>Find the cookie named 'sid' and copy its Value</li>
                <li>Paste it below</li>
              </ol>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  JPDB Session Cookie:
                </label>
                <input
                  type="text"
                  name="cookie"
                  placeholder="Paste your sid cookie value here..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  required
                />
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Just paste the value, not "sid=" - we'll format it automatically
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                >
                  💾 Save Cookie
                </button>
                <button
                  type="button"
                  onClick={() => setStep('setup')}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  ← Back to Bookmarklet
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
} 