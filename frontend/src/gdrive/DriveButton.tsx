import { useState } from 'react';
import { useDrive } from '../contexts/DriveProvider';

/**
 * Button UI for connecting to Google Drive and triggering sync.
 */
export function DriveButton() {
  const { isConnected, signIn } = useDrive();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (isConnected) {
      return;
    }
    setConnecting(true);
    try {
      await signIn('consent');
    } catch (e) {
      console.error(e);
      alert('Drive connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const buttonText = connecting
    ? 'Connecting…'
    : isConnected
      ? 'Connected'
      : 'Connect Drive';

  return (
    <div className="flex items-center gap-2">
      <button
        id="connect-drive-btn"
        onClick={handleConnect}
        disabled={connecting}
        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
      >
        {buttonText}
      </button>
      {/* Legacy sync button removed */}
    </div>
  );
}
