import React from 'react';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import { gDriveService } from '../services/gdriveService';

export const GoogleDriveConnectButton: React.FC = () => {
  const {
    isDriveConnected,
    driveUser,
    isLoading,
    error,
    fetchDriveFiles,
    getAppFolderId
  } = useGoogleDrive();

  const handleConnect = () => {
    // You can prompt for 'select_account' or 'consent' if needed
    gDriveService.signIn('consent');
  };

  const handleDisconnect = () => {
    gDriveService.signOut();
  };

  const handleFetchFiles = async () => {
    const folderId = await getAppFolderId();
    if (folderId) {
      fetchDriveFiles(folderId);
    }
  };

  if (isLoading && !isDriveConnected && !driveUser) {
    return <button disabled>Connecting to Google Drive...</button>;
  }

  return (
    <div style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
      {isDriveConnected && driveUser ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            {driveUser.picture && (
              <img
                src={driveUser.picture}
                alt={driveUser.name || 'User'}
                style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '10px' }}
              />
            )}
            <div>
              <p style={{ margin: 0 }}>Connected as: <strong>{driveUser.name}</strong></p>
              <p style={{ margin: 0, fontSize: '0.8em' }}>({driveUser.email})</p>
            </div>
          </div>
          <button onClick={handleDisconnect} style={{ marginRight: '10px' }}>
            Disconnect from Google Drive
          </button>
          <button onClick={handleFetchFiles} disabled={isLoading} >
            {isLoading ? 'Fetching Files...' : 'Fetch My Drive Files'}
          </button>
        </div>
      ) : (
        <button onClick={handleConnect} disabled={isLoading}>
          {isLoading ? 'Connecting...' : 'Connect to Google Drive'}
        </button>
      )}
      {error && (
        <p style={{ color: 'red', marginTop: '10px' }}>Error: {error.message}</p>
      )}
      {/* Display files or other actions here later */}
    </div>
  );
}; 