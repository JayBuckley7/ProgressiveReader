import React from 'react';
import { useGoogleDrive } from '../hooks/useGoogleDrive';

export const GoogleDriveConnectButton: React.FC = () => {
  const {
    is_drive_connected,
    drive_user,
    is_loading,
    error,
    connect_to_drive,
    disconnect_from_drive,
    fetch_drive_files,
    get_app_folder_id
  } = useGoogleDrive();

  const handleConnect = () => {
    // You can prompt for 'select_account' or 'consent' if needed, e.g., connect_to_drive('select_account');
    connect_to_drive();
  };

  const handleDisconnect = () => {
    disconnect_from_drive();
  };

  const handleFetchFiles = async () => {
    const folderId = await get_app_folder_id();
    if (folderId) {
      fetch_drive_files(folderId);
    }
  };

  if (is_loading && !is_drive_connected && !drive_user) {
    return <button disabled>Connecting to Google Drive...</button>;
  }

  return (
    <div style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
      {is_drive_connected && drive_user ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            {drive_user.picture && (
              <img
                src={drive_user.picture}
                alt={drive_user.name || 'User'}
                style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '10px' }}
              />
            )}
            <div>
              <p style={{ margin: 0 }}>Connected as: <strong>{drive_user.name}</strong></p>
              <p style={{ margin: 0, fontSize: '0.8em' }}>({drive_user.email})</p>
            </div>
          </div>
          <button onClick={handleDisconnect} style={{ marginRight: '10px' }}>
            Disconnect from Google Drive
          </button>
          <button onClick={handleFetchFiles} disabled={is_loading} >
            {is_loading ? 'Fetching Files...' : 'Fetch My Drive Files'}
          </button>
        </div>
      ) : (
        <button onClick={handleConnect} disabled={is_loading}>
          {is_loading ? 'Connecting...' : 'Connect to Google Drive'}
        </button>
      )}
      {error && (
        <p style={{ color: 'red', marginTop: '10px' }}>Error: {error.message}</p>
      )}
      {/* Display files or other actions here later */}
    </div>
  );
}; 