import React, { useState } from 'react';
import { Folder } from '../types';

interface FolderManagerProps {
  folders: Folder[];
  onCreateFolder: (name: string, parentId?: string) => void;
  onUpdateFolder: (folderId: string, updates: { name?: string; parentId?: string }) => void;
  onDeleteFolder: (folderId: string) => void;
  onClose: () => void;
}

export function FolderManager({ 
  folders, 
  onCreateFolder, 
  onUpdateFolder, 
  onDeleteFolder, 
  onClose 
}: FolderManagerProps) {
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName('');
    }
  };

  const handleStartEdit = (folder: Folder) => {
    setEditingFolder(folder);
    setEditName(folder.name);
  };

  const handleSaveEdit = () => {
    if (editingFolder && editName.trim() && editName.trim() !== editingFolder.name) {
      onUpdateFolder(editingFolder.id, { name: editName.trim() });
    }
    setEditingFolder(null);
    setEditName('');
  };

  const handleCancelEdit = () => {
    setEditingFolder(null);
    setEditName('');
  };

  const handleDeleteFolder = (folder: Folder) => {
    if (confirm(`Are you sure you want to delete the folder "${folder.name}"?`)) {
      onDeleteFolder(folder.id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Folders</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Create new folder */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Create New Folder</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        </div>

        {/* Folder list */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Your Folders</h3>
          {folders.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">No folders yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  {editingFolder?.id === folder.id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-600 dark:text-white"
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="text-gray-900 dark:text-white">{folder.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleStartEdit(folder)}
                          className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                          title="Edit folder"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(folder)}
                          className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                          title="Delete folder"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 