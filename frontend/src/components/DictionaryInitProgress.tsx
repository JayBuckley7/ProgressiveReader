// Dictionary Initialization Progress Component
import React, { useEffect, useState } from 'react';
import { dictionaryInitializer, type InitializationStatus } from '../services/dictionaryInitializer';

const DictionaryInitProgress: React.FC = () => {
  const [status, setStatus] = useState<InitializationStatus>(dictionaryInitializer.getStatus());
  const [isOfflineEnabled, setIsOfflineEnabled] = useState(
    localStorage.getItem('useOfflineParser') === 'true'
  );
  const [showCompletionMessage, setShowCompletionMessage] = useState(false);

  useEffect(() => {
    // Don't start initialization if offline parser is disabled
    const offlineEnabled = localStorage.getItem('useOfflineParser') === 'true';
    setIsOfflineEnabled(offlineEnabled);

    // Set up polling for status updates
    const interval = setInterval(() => {
      const newStatus = dictionaryInitializer.getStatus();
      const wasInitializing = status.isInitializing;
      const isNowInitialized = newStatus.isInitialized;
      
      setStatus(newStatus);
      setIsOfflineEnabled(localStorage.getItem('useOfflineParser') === 'true');
      
      // Show completion message when indexing finishes
      if (wasInitializing && isNowInitialized && !showCompletionMessage) {
        setShowCompletionMessage(true);
        setTimeout(() => setShowCompletionMessage(false), 3000); // Hide after 3 seconds
      }
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Don't show anything if offline parser is disabled
  if (!isOfflineEnabled) {
    return null;
  }

  // Show completion message briefly after initialization
  if (status.isInitialized && showCompletionMessage) {
    return (
      <div className="fixed top-4 right-4 bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 min-w-[300px] z-50">
        <div className="flex items-center space-x-3">
          <div className="text-green-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-green-900">
              ✅ Offline Japanese dictionary ready!
            </div>
            <div className="text-xs text-green-700 mt-1">
              Dictionary lookups will now be instant
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Don't show anything if already initialized (and not showing completion)
  if (status.isInitialized) {
    return null;
  }

  // Don't show anything if not initializing (error or not started)
  if (!status.isInitializing) {
    return null;
  }

  const progress = status.progress;
  if (!progress) {
    return null;
  }

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'downloading': return 'Downloading Japanese dictionary for offline translation...';
      case 'initializing_worker': return 'Preparing translation engine...';
      case 'loading_archive': return 'Extracting dictionary files...';
      case 'building_index': return 'Building search index for instant lookups...';
      case 'complete': return 'Offline Japanese dictionary ready!';
      default: return 'Setting up offline translation...';
    }
  };

  return (
    <div className="fixed top-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[300px] z-50">
      <div className="flex items-center space-x-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-900">
            {getStageLabel(progress.stage)}
          </div>
                     <div className="mt-1">
             <div className="flex justify-between text-xs text-gray-500 mb-1">
               <span>{Math.round(progress.progress)}%</span>
               {progress.stage === 'downloading' && progress.totalEntries && (
                 <span>{progress.totalEntries.toLocaleString()} KB downloaded</span>
               )}
               {progress.stage === 'building_index' && progress.totalEntries && (
                 <span>{progress.totalEntries.toLocaleString()} entries processed</span>
               )}
               {progress.stage !== 'downloading' && progress.stage !== 'building_index' && progress.totalEntries && (
                 <span>{progress.totalEntries.toLocaleString()} entries</span>
               )}
             </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>
          {progress.processedFiles && progress.totalFiles && (
            <div className="text-xs text-gray-500 mt-1">
              File {progress.processedFiles} of {progress.totalFiles}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DictionaryInitProgress; 