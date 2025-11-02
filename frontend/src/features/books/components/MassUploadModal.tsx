import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useAppData } from '@shared/contexts/AppDataContext';
import { EpubProcessorWrapper } from '@shared/lib/epubProcessor';

interface BookFileData {
  id: string;
  file: File;
  title: string;
  author: string;
  language: string;
  description: string;
  totalPages: string;
  fileType: string;
  status: 'pending' | 'processing' | 'uploading' | 'completed' | 'error';
  error?: string;
  progress: number;
}

interface MassUploadModalProps {
  onClose: () => void;
  onUploadComplete?: () => void;
}

export function MassUploadModal({ onClose, onUploadComplete }: MassUploadModalProps) {
  const { isAuthenticated, signIn, uploadBook } = useAppData();
  const [bookFiles, setBookFiles] = useState<BookFileData[]>([]);
  const [isProcessingMetadata, setIsProcessingMetadata] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supportedFormats = ['epub', 'txt', 'docx', 'pdf', 'mobi'];
  const languageOptions = [
    'English', 'Spanish', 'French', 'German', 'Italian', 
    'Portuguese', 'Japanese', 'Korean', 'Chinese', 'Other'
  ];

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const validateFile = (file: File): boolean => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !supportedFormats.includes(fileExtension)) {
      toast.error(`Unsupported file format: ${file.name}. Please use EPUB, TXT, DOCX, PDF, or MOBI files.`);
      return false;
    }
    return true;
  };

  const extractMetadataFromEpub = async (file: File): Promise<Partial<BookFileData>> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const epubProcessor = new EpubProcessorWrapper();
      const success = await epubProcessor.loadBook(arrayBuffer);
      
      if (success) {
        const metadata = epubProcessor.metadata;
        return {
          title: metadata?.title || file.name.replace(/\.[^/.]+$/, ''),
          author: Array.isArray(metadata?.creator) ? metadata.creator[0] : metadata?.creator || 'Unknown Author',
          description: metadata?.description || '',
          language: getLanguageFromCode(metadata?.language) || 'English',
          totalPages: epubProcessor.getTotalChapters()?.toString() || ''
        };
      }
    } catch (error) {
      console.warn('Failed to extract EPUB metadata:', error);
    }
    
    return {
      title: file.name.replace(/\.[^/.]+$/, ''),
      author: 'Unknown Author',
      description: '',
      language: 'English',
      totalPages: ''
    };
  };

  const getLanguageFromCode = (code?: string): string => {
    if (!code) return 'English';
    const lang = code.toLowerCase();
    const languageMap: Record<string, string> = {
      'en': 'English',
      'es': 'Spanish', 
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese'
    };
    return languageMap[lang] || 'Other';
  };

  const processFiles = async (files: File[]) => {
    setIsProcessingMetadata(true);
    const validFiles = files.filter(validateFile);
    
    if (validFiles.length === 0) {
      setIsProcessingMetadata(false);
      return;
    }

    const newBookFiles: BookFileData[] = [];

    for (const file of validFiles) {
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
      let metadata: Partial<BookFileData>;

      if (fileExtension === 'epub') {
        metadata = await extractMetadataFromEpub(file);
      } else {
        metadata = {
          title: file.name.replace(/\.[^/.]+$/, ''),
          author: 'Unknown Author',
          description: '',
          language: 'English',
          totalPages: ''
        };
      }

      newBookFiles.push({
        id: generateId(),
        file,
        title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
        author: metadata.author || 'Unknown Author',
        language: metadata.language || 'English',
        description: metadata.description || '',
        totalPages: metadata.totalPages || '',
        fileType: fileExtension,
        status: 'pending',
        progress: 0
      });
    }

    setBookFiles(prev => [...prev, ...newBookFiles]);
    setIsProcessingMetadata(false);
    
    if (newBookFiles.length > 0) {
      toast.success(`Added ${newBookFiles.length} book(s) for upload. Review and edit metadata as needed.`);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processFiles(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const updateBookFile = (id: string, updates: Partial<BookFileData>) => {
    setBookFiles(prev => prev.map(book => 
      book.id === id ? { ...book, ...updates } : book
    ));
  };

  const removeBookFile = (id: string) => {
    setBookFiles(prev => prev.filter(book => book.id !== id));
  };

  const retryFailedUpload = async (bookId: string) => {
    const book = bookFiles.find(b => b.id === bookId);
    if (!book || book.status !== 'error') return;

    try {
      updateBookFile(bookId, { status: 'uploading', progress: 0, error: undefined });

      const meta = {
        title: book.title.trim(),
        fileType: book.fileType
      };

      updateBookFile(bookId, { progress: 50 });
      
      const result = await uploadBook(book.file, meta);
      
      if (result) {
        updateBookFile(bookId, { status: 'completed', progress: 100 });
        toast.success(`Successfully retried upload for "${book.title}"`);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error: any) {
      console.error(`Retry failed for ${book.title}:`, error);
      updateBookFile(bookId, { 
        status: 'error', 
        error: error.message || 'Upload failed',
        progress: 0 
      });
             toast.error(`Retry failed for "${book.title}"`);
     }
   };

   const retryAllFailed = async () => {
     const failedBooks = bookFiles.filter(book => book.status === 'error');
     if (failedBooks.length === 0) return;

     toast.info(`Retrying ${failedBooks.length} failed upload(s)...`);
     
     for (const book of failedBooks) {
       await retryFailedUpload(book.id);
     }
   };

  const uploadBooks = async () => {
    if (!isAuthenticated) {
      try {
        await signIn();
      } catch (error) {
        toast.error('Please sign in to upload books');
        return;
      }
    }

    const booksToUpload = bookFiles.filter(book => book.status !== 'completed');
    if (booksToUpload.length === 0) {
      toast.info('No books to upload');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ completed: 0, total: booksToUpload.length });

    let completed = 0;
    
    for (const book of booksToUpload) {
      try {
        updateBookFile(book.id, { status: 'uploading', progress: 0 });

        const meta = {
          title: book.title.trim(),
          fileType: book.fileType
        };

        updateBookFile(book.id, { progress: 50 });
        
        const result = await uploadBook(book.file, meta);
        
        if (result) {
          updateBookFile(book.id, { status: 'completed', progress: 100 });
          completed++;
        } else {
          throw new Error('Upload failed');
        }
      } catch (error: any) {
        console.error(`Failed to upload ${book.title}:`, error);
        updateBookFile(book.id, { 
          status: 'error', 
          error: error.message || 'Upload failed',
          progress: 0 
        });
      }
      
      setUploadProgress({ completed: completed, total: booksToUpload.length });
    }

    setIsUploading(false);
    
    if (completed > 0) {
      toast.success(`Successfully uploaded ${completed} book(s)!`);
      onUploadComplete?.();
    }
    
    if (completed === booksToUpload.length) {
      // All successful, close modal after a brief delay
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  const getStatusColor = (status: BookFileData['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-600';
      case 'processing': return 'text-blue-600';
      case 'uploading': return 'text-yellow-600';
      case 'completed': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: BookFileData['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'processing': return '🔄';
      case 'uploading': return '📤';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mass Upload Books</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Upload multiple books at once. Drag & drop files or click to select.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            } ${isProcessingMetadata ? 'opacity-50 pointer-events-none' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
          >
            <div className="space-y-4">
              <div className="text-6xl">📚</div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {isProcessingMetadata ? 'Processing files...' : 'Drop your books here'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  or{' '}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                    disabled={isProcessingMetadata}
                  >
                    browse to select files
                  </button>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Supports: {supportedFormats.map(f => f.toUpperCase()).join(', ')}
                </p>
              </div>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={supportedFormats.map(ext => `.${ext}`).join(',')}
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessingMetadata}
            />
          </div>

          {/* Book List */}
          {bookFiles.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Books to Upload ({bookFiles.length})
                </h3>
                {isUploading && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Progress: {uploadProgress.completed}/{uploadProgress.total}
                  </div>
                )}
              </div>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {bookFiles.map(book => (
                  <div key={book.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{getStatusIcon(book.status)}</span>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">{book.file.name}</h4>
                          <p className={`text-sm ${getStatusColor(book.status)}`}>
                            {book.status === 'error' ? book.error : book.status}
                          </p>
                        </div>
                      </div>
                      
                      {book.status === 'pending' && (
                        <button
                          onClick={() => removeBookFile(book.id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      )}
                      
                      {book.status === 'error' && (
                        <button
                          onClick={() => retryFailedUpload(book.id)}
                          className="text-blue-500 hover:text-blue-700 text-sm flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 15a9 9 0 0014-3m0-4a9 9 0 00-14-3" />
                          </svg>
                          Retry
                        </button>
                      )}
                    </div>

                    {book.status === 'uploading' && book.progress > 0 && (
                      <div className="mb-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${book.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <label className="block text-gray-700 dark:text-gray-300 mb-1">Title</label>
                        <input
                          type="text"
                          value={book.title}
                          onChange={(e) => updateBookFile(book.id, { title: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white dark:bg-gray-700"
                          disabled={book.status !== 'pending'}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-700 dark:text-gray-300 mb-1">Author</label>
                        <input
                          type="text"
                          value={book.author}
                          onChange={(e) => updateBookFile(book.id, { author: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white dark:bg-gray-700"
                          disabled={book.status !== 'pending'}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-700 dark:text-gray-300 mb-1">Language</label>
                        <select
                          value={book.language}
                          onChange={(e) => updateBookFile(book.id, { language: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white dark:bg-gray-700"
                          disabled={book.status !== 'pending'}
                        >
                          {languageOptions.map(lang => (
                            <option key={lang} value={lang}>{lang}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-gray-700 dark:text-gray-300 mb-1">Pages/Chapters</label>
                        <input
                          type="number"
                          value={book.totalPages}
                          onChange={(e) => updateBookFile(book.id, { totalPages: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white dark:bg-gray-700"
                          disabled={book.status !== 'pending'}
                          min="1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {bookFiles.length > 0 && (
                <span>
                  {bookFiles.filter(b => b.status === 'completed').length} completed, {' '}
                  {bookFiles.filter(b => b.status === 'error').length} failed
                </span>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                disabled={isUploading}
              >
                {bookFiles.some(b => b.status === 'completed') ? 'Close' : 'Cancel'}
              </button>
              
              {bookFiles.length > 0 && (
                <>
                  {bookFiles.filter(b => b.status === 'error').length > 0 && !isUploading && (
                    <button
                      onClick={retryAllFailed}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      Retry All Failed ({bookFiles.filter(b => b.status === 'error').length})
                    </button>
                  )}
                  <button
                    onClick={uploadBooks}
                    disabled={isUploading || isProcessingMetadata || bookFiles.filter(b => b.status === 'pending').length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading 
                      ? `Uploading... (${uploadProgress.completed}/${uploadProgress.total})`
                      : `Upload ${bookFiles.filter(b => b.status === 'pending').length} Book(s)`
                    }
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
