import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAppData } from '@shared/contexts/AppDataContext';
import { EpubProcessorWrapper } from '@shared/lib/epubProcessor.ts';

interface BookFileData {
  id: string;
  file: File;
  title: string;
  author: string;
  language: string;
  description: string;
  totalPages: string;
  fileType: string;
  processOCR?: boolean;
  status: 'pending' | 'processing' | 'uploading' | 'completed' | 'error';
  error?: string;
  progress: number;
}

interface MassUploadModalProps {
  onClose: () => void;
  onUploadComplete?: () => void;
}

export function MassUploadModal({ onClose, onUploadComplete }: MassUploadModalProps) {
  const { t } = useTranslation();
  const { isAuthenticated, signIn, uploadBook } = useAppData();
  const [bookFiles, setBookFiles] = useState<BookFileData[]>([]);
  const [isProcessingMetadata, setIsProcessingMetadata] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supportedFormats = ['epub', 'txt', 'docx', 'pdf', 'mobi', 'json'];
  const languageOptions = [
    'English', 'Spanish', 'French', 'German', 'Italian', 
    'Portuguese', 'Japanese', 'Korean', 'Chinese', 'Other'
  ];

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const validateFile = (file: File): boolean => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !supportedFormats.includes(fileExtension)) {
      toast.error(t('massUpload.toasts.unsupportedFormat', { fileName: file.name }));
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
          author: Array.isArray(metadata?.creator) ? metadata.creator[0] : metadata?.creator || t('massUpload.defaults.unknownAuthor'),
          description: metadata?.description || '',
          language: getLanguageFromCode(metadata?.language) || t('massUpload.defaults.defaultLanguage'),
          totalPages: epubProcessor.getTotalChapters()?.toString() || ''
        };
      }
    } catch (error) {
      console.warn('Failed to extract EPUB metadata:', error);
    }
    
    return {
      title: file.name.replace(/\.[^/.]+$/, ''),
      author: t('massUpload.defaults.unknownAuthor'),
      description: '',
      language: t('massUpload.defaults.defaultLanguage'),
      totalPages: ''
    };
  };

  const getLanguageFromCode = (code?: string): string => {
    if (!code) return t('massUpload.defaults.defaultLanguage');
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
          author: t('massUpload.defaults.unknownAuthor'),
          description: '',
          language: t('massUpload.defaults.defaultLanguage'),
          totalPages: ''
        };
      }

      newBookFiles.push({
        id: generateId(),
        file,
        title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
        author: metadata.author || t('massUpload.defaults.unknownAuthor'),
        language: metadata.language || t('massUpload.defaults.defaultLanguage'),
        description: metadata.description || '',
        totalPages: metadata.totalPages || '',
        fileType: fileExtension,
        processOCR: false,
        status: 'pending',
        progress: 0
      });
    }

    setBookFiles(prev => [...prev, ...newBookFiles]);
    setIsProcessingMetadata(false);
    
    if (newBookFiles.length > 0) {
      toast.success(t('massUpload.toasts.addedBooks', { count: newBookFiles.length }));
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
        fileType: book.fileType,
        processOCR: book.processOCR && book.fileType === 'pdf'
      };

      updateBookFile(bookId, { progress: 50 });
      
      const result = await uploadBook(
        book.file, 
        meta,
        // OCR progress callback for PDFs
        book.processOCR && book.fileType === 'pdf'
          ? (progress) => {
              if (progress.percent !== undefined) {
                // OCR progress is 0-90%, upload is 90-100%
                updateBookFile(bookId, { progress: Math.min(90, progress.percent || 0) });
              }
            }
          : undefined
      );
      
      if (result) {
        updateBookFile(bookId, { status: 'completed', progress: 100 });
        toast.success(t('massUpload.toasts.retrySuccess', { title: book.title }));
      } else {
        throw new Error(t('massUpload.toasts.uploadFailed'));
      }
    } catch (error: any) {
      console.error(`Retry failed for ${book.title}:`, error);
      updateBookFile(bookId, { 
        status: 'error', 
        error: error.message || t('massUpload.toasts.uploadFailed'),
        progress: 0 
      });
             toast.error(t('massUpload.toasts.retryFailed', { title: book.title }));
     }
   };

   const retryAllFailed = async () => {
     const failedBooks = bookFiles.filter(book => book.status === 'error');
     if (failedBooks.length === 0) return;

     toast.info(t('massUpload.toasts.retrying', { count: failedBooks.length }));
     
     for (const book of failedBooks) {
       await retryFailedUpload(book.id);
     }
   };

  const uploadBooks = async () => {
    if (!isAuthenticated) {
      try {
        await signIn();
      } catch (error) {
        toast.error(t('massUpload.toasts.signInRequired'));
        return;
      }
    }

    const booksToUpload = bookFiles.filter(book => book.status !== 'completed');
    if (booksToUpload.length === 0) {
      toast.info(t('massUpload.toasts.noBooks'));
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
          fileType: book.fileType,
          processOCR: book.processOCR && book.fileType === 'pdf'
        };

        updateBookFile(book.id, { progress: 50 });
        
        const result = await uploadBook(
          book.file, 
          meta,
          // OCR progress callback for PDFs
          book.processOCR && book.fileType === 'pdf'
            ? (progress) => {
                if (progress.percent !== undefined) {
                  // OCR progress is 0-90%, upload is 90-100%
                  updateBookFile(book.id, { progress: Math.min(90, progress.percent || 0) });
                }
              }
            : undefined
        );
        
        if (result) {
          updateBookFile(book.id, { status: 'completed', progress: 100 });
          completed++;
        } else {
          throw new Error(t('massUpload.toasts.uploadFailed'));
        }
      } catch (error: any) {
        console.error(`Failed to upload ${book.title}:`, error);
        updateBookFile(book.id, { 
          status: 'error', 
          error: error.message || t('massUpload.toasts.uploadFailed'),
          progress: 0 
        });
      }
      
      setUploadProgress({ completed: completed, total: booksToUpload.length });
    }

    setIsUploading(false);
    
    if (completed > 0) {
      toast.success(t('massUpload.toasts.uploadSuccess', { count: completed }));
      onUploadComplete?.();
    }
    
    if (completed === booksToUpload.length) {
      // All successful, close modal after a brief delay
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  const getStatusLabel = (status: BookFileData['status']): string => {
    return t(`massUpload.bookList.status.${status}`);
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
      case 'pending': return '•';
      case 'processing': return '•';
      case 'uploading': return '•';
      case 'completed': return '•';
      case 'error': return '•';
      default: return '•';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="app-card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b app-border">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">{t('massUpload.title')}</h2>
            <button
              onClick={onClose}
              className="p-1.5 app-icon-button transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm app-muted mt-2">
            {t('massUpload.description')}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors app-border ${
              dragActive ? 'bg-[var(--ui-surface-alt)]' : 'hover:bg-[var(--ui-surface-alt)]'
            } ${isProcessingMetadata ? 'opacity-50 pointer-events-none' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
          >
            <div className="space-y-4">
              <div className="mx-auto h-16 w-16 book-cover-placeholder rounded-lg flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium">
                  {isProcessingMetadata ? t('massUpload.dropZone.processing') : t('massUpload.dropZone.dropHere')}
                </h3>
                <p className="text-sm app-muted">
                  {t('massUpload.dropZone.or')}{' '}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="font-medium underline underline-offset-4 hover:opacity-80"
                    disabled={isProcessingMetadata}
                  >
                    {t('massUpload.dropZone.browse')}
                  </button>
                </p>
                <p className="text-sm app-muted mt-2">
                  {t('massUpload.dropZone.supports')} {supportedFormats.map(f => f.toUpperCase()).join(', ')}
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
                  {t('massUpload.bookList.title')} ({bookFiles.length})
                </h3>
                {isUploading && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {t('massUpload.bookList.progress')} {uploadProgress.completed}/{uploadProgress.total}
                  </div>
                )}
              </div>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {bookFiles.map(book => (
                  <div key={book.id} className="app-card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{getStatusIcon(book.status)}</span>
                        <div>
                          <h4 className="font-medium">{book.file.name}</h4>
                          <p className={`text-sm ${getStatusColor(book.status)}`}>
                            {book.status === 'error' ? book.error : getStatusLabel(book.status)}
                          </p>
                        </div>
                      </div>
                      
                      {book.status === 'pending' && (
                        <button
                          onClick={() => removeBookFile(book.id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          {t('massUpload.bookList.actions.remove')}
                        </button>
                      )}
                      
                      {book.status === 'error' && (
                        <button
                          onClick={() => retryFailedUpload(book.id)}
                          className="px-2 py-1 rounded-md text-sm font-medium app-button-muted flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 15a9 9 0 0014-3m0-4a9 9 0 00-14-3" />
                          </svg>
                          {t('massUpload.bookList.actions.retry')}
                        </button>
                      )}
                    </div>

                    {book.status === 'uploading' && book.progress > 0 && (
                      <div className="mb-3">
                        <div className="w-full bg-[var(--ui-surface-alt)] rounded-full h-2">
                          <div 
                            className="app-progress-bar h-2 rounded-full transition-all duration-300"
                            style={{ width: `${book.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <label className="block text-xs font-medium app-muted mb-1">{t('massUpload.bookList.labels.title')}</label>
                        <input
                          type="text"
                          value={book.title}
                          onChange={(e) => updateBookFile(book.id, { title: e.target.value })}
                          className="app-input w-full px-2 py-1 text-sm disabled:opacity-60"
                          disabled={book.status !== 'pending'}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium app-muted mb-1">{t('massUpload.bookList.labels.author')}</label>
                        <input
                          type="text"
                          value={book.author}
                          onChange={(e) => updateBookFile(book.id, { author: e.target.value })}
                          className="app-input w-full px-2 py-1 text-sm disabled:opacity-60"
                          disabled={book.status !== 'pending'}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium app-muted mb-1">{t('massUpload.bookList.labels.language')}</label>
                        <select
                          value={book.language}
                          onChange={(e) => updateBookFile(book.id, { language: e.target.value })}
                          className="app-input w-full px-2 py-1 text-sm disabled:opacity-60"
                          disabled={book.status !== 'pending'}
                        >
                          {languageOptions.map(lang => (
                            <option key={lang} value={lang}>{lang}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-gray-700 dark:text-gray-300 mb-1">{t('massUpload.bookList.labels.pagesChapters')}</label>
                        <input
                          type="number"
                          value={book.totalPages}
                          onChange={(e) => updateBookFile(book.id, { totalPages: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white dark:bg-gray-700"
                          disabled={book.status !== 'pending'}
                          min="1"
                        />
                      </div>
                      
                      {book.fileType === 'pdf' && (
                        <div className="md:col-span-2">
                          <div className="flex items-center p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <input
                              type="checkbox"
                              id={`processOCR-${book.id}`}
                              checked={book.processOCR || false}
                              onChange={(e) => updateBookFile(book.id, { processOCR: e.target.checked })}
                              className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              disabled={book.status !== 'pending'}
                            />
                            <label htmlFor={`processOCR-${book.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                              {t('massUpload.bookList.ocr.label')}
                            </label>
                          </div>
                        </div>
                      )}
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
                  {bookFiles.filter(b => b.status === 'completed').length} {t('massUpload.bookList.summary.completed')}, {' '}
                  {bookFiles.filter(b => b.status === 'error').length} {t('massUpload.bookList.summary.failed')}
                </span>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                disabled={isUploading}
              >
                {bookFiles.some(b => b.status === 'completed') ? t('massUpload.buttons.close') : t('massUpload.buttons.cancel')}
              </button>
              
              {bookFiles.length > 0 && (
                <>
                  {bookFiles.filter(b => b.status === 'error').length > 0 && !isUploading && (
                    <button
                      onClick={retryAllFailed}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      {t('massUpload.buttons.retryAllFailed')} ({bookFiles.filter(b => b.status === 'error').length})
                    </button>
                  )}
                  <button
                    onClick={uploadBooks}
                    disabled={isUploading || isProcessingMetadata || bookFiles.filter(b => b.status === 'pending').length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading 
                      ? `${t('massUpload.buttons.uploading')} (${uploadProgress.completed}/${uploadProgress.total})`
                      : t('massUpload.buttons.upload', { count: bookFiles.filter(b => b.status === 'pending').length })
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
