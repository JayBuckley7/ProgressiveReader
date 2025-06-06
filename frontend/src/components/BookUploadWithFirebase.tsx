import { useState } from 'react';
import { useStorageService } from '../hooks/useStorageService';
import { toast } from 'sonner';

interface BookUploadWithFirebaseProps {
  onUploadComplete?: () => void;
}

export function BookUploadWithFirebase({ onUploadComplete }: BookUploadWithFirebaseProps) {
  const { user, isAuthenticated, signIn, uploadBook } = useStorageService();
  const [is_uploading, set_is_uploading] = useState(false);
  const [selected_file, set_selected_file] = useState<File | null>(null);

  const handle_file_select = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      set_selected_file(file);
    }
  };

  const handle_upload = async () => {
    if (!selected_file) return;

    if (!isAuthenticated) {
      try {
        await signIn();
      } catch (error) {
        toast.error('Please sign in to upload books');
        return;
      }
    }

    set_is_uploading(true);
    try {
      // Upload to Google Drive via Firebase storage service
      const bookMetadata = await uploadBook(selected_file);
      
      if (bookMetadata) {
        toast.success('Book uploaded successfully!');
        set_selected_file(null);
        onUploadComplete?.();
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload book');
    } finally {
      set_is_uploading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4">Upload Book</h3>
      
      {isAuthenticated ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <img 
              src={user?.photoURL || ''} 
              alt={user?.displayName || 'User'} 
              className="w-6 h-6 rounded-full"
            />
            <span>Signed in as {user?.email}</span>
          </div>
          
          <div>
            <input
              type="file"
              accept=".epub,.pdf,.txt,.docx,.mobi"
              onChange={handle_file_select}
              disabled={is_uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50"
            />
          </div>
          
          {selected_file && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Selected: {selected_file.name}
            </div>
          )}
          
          <button
            onClick={handle_upload}
            disabled={!selected_file || is_uploading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {is_uploading ? 'Uploading...' : 'Upload to Google Drive'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Sign in with Google to upload books to your Drive
          </p>
          <button
            onClick={signIn}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
              flex items-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
} 