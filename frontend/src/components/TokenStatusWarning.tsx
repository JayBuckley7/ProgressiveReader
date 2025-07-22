import React from 'react';
import { useAppData } from '../contexts/AppDataContext';
import { toast } from 'sonner';

export function TokenStatusWarning() {
  const { isDriveConnected, isTokenNearExpiry, isRefreshing, refreshToken } = useAppData();

  // Don't show anything if not connected or token is fine
  if (!isDriveConnected || !isTokenNearExpiry) {
    return null;
  }

  const handleRefresh = async () => {
    try {
      const success = await refreshToken();
      if (success) {
        toast.success('Google Drive connection refreshed successfully');
      } else {
        toast.error('Failed to refresh Google Drive connection. You may need to sign in again.');
      }
    } catch (error) {
      toast.error('Error refreshing Google Drive connection');
    }
  };

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="text-yellow-600 dark:text-yellow-400 mr-2">
            ⚠️
          </div>
          <div>
            <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Google Drive Connection Expiring
            </h4>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Your Google Drive session will expire soon. Refresh it to avoid interruptions.
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white text-sm px-3 py-1 rounded transition-colors"
        >
          {isRefreshing ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
              Refreshing...
            </div>
          ) : (
            'Refresh'
          )}
        </button>
      </div>
    </div>
  );
} 