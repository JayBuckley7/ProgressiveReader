import React, { useState } from 'react';
import { Folder } from '~/types';

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="app-card w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Manage Folders</h2>
          <button
            onClick={onClose}
            className="p-2 app-icon-button transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Create new folder */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-3">Create folder</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="app-input flex-1 px-3 py-2 text-sm"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="px-4 py-2 rounded-md text-sm font-medium app-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        </div>

        {/* Folder list */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Folders</h3>
          {folders.length === 0 ? (
            <p className="app-muted text-center py-4">No folders yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 rounded-md border app-border bg-[var(--ui-surface-alt)]"
                >
                  {editingFolder?.id === folder.id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="app-input flex-1 px-2 py-1 text-sm"
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="px-2 py-1 text-sm rounded-md app-button-primary"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 text-sm rounded-md app-button-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 app-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span>{folder.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleStartEdit(folder)}
                          className="p-1.5 app-icon-button transition-colors"
                          title="Edit folder"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(folder)}
                          className="p-1.5 app-icon-button transition-colors text-red-600 hover:text-red-700"
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
