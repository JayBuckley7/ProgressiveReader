import { useState, useEffect } from 'react';
import { BookMetadata } from '~/types';
import { toast } from 'sonner';

interface EditBookModalProps {
  book: BookMetadata;
  onClose: () => void;
  onSave: (bookId: string, updates: { title?: string; author?: string }) => Promise<void>;
}

export function EditBookModal({ book, onClose, onSave }: EditBookModalProps) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Try to get author from book metadata if available
    // This might need to be adjusted based on your BookMetadata type
    setAuthor('');
  }, [book]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(book.id, { title: title.trim(), author: author.trim() });
      toast.success('Book details updated successfully');
      onClose();
    } catch (error) {
      console.error('Error updating book:', error);
      toast.error('Failed to update book details');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="app-card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b app-border flex justify-between items-center">
          <h2 className="text-lg font-semibold">Edit book</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 app-icon-button transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="app-input w-full px-3 py-2 text-sm"
              placeholder="Enter book title"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Author
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onKeyDown={handleKeyDown}
              className="app-input w-full px-3 py-2 text-sm"
              placeholder="Enter author name"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t app-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium app-button-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium app-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
