import { useMemo, useState, useRef, useEffect } from 'react';
import { BookMetadata, Folder } from '~/types';
import { EditBookModal } from './EditBookModal';
import { BookCoverService } from '@features/books/services/bookCovers';
import { toast } from 'sonner';
import { appLog } from '@shared/appLog'
import { notifyError } from '@shared/utils/notify';
import { useAppDeps } from '@app/deps/AppDepsProvider';
import { useAppData } from '@shared/contexts/AppDataContext';

interface BookCardHoverProps {
  book: BookMetadata;
  onSelectBook: (bookId: string) => void;
  onDeleteBook: (bookId: string) => Promise<void>;
  onUpdateCover: (bookId: string, coverFile: File) => Promise<string | undefined>;
  onMoveToFolder?: (bookId: string, folderId: string | null) => void;
  availableFolders?: Folder[];
  currentFolderId?: string | null;
  onBookUpdated?: () => void;
  density?: "comfortable" | "compact";
}

const LONG_PRESS_DELAY_MS = 550;
const LONG_PRESS_MOVE_THRESHOLD_PX = 12;

export function BookCardHover({ 
  book, 
  onSelectBook, 
  onDeleteBook, 
  onUpdateCover, 
  onMoveToFolder,
  availableFolders = [],
  currentFolderId,
  onBookUpdated,
  density = "comfortable"
}: BookCardHoverProps) {
  const deps = useAppDeps();
  const { updateBookMetadata } = useAppData();
  const [isHovered, setIsHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showCoverMenu, setShowCoverMenu] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [placeholderUrl, setPlaceholderUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);

  const coverService = useMemo(() => new BookCoverService(deps.backend.covers), [deps.backend.covers]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const handler = () => setIsMobile(media.matches);
    handler();
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current != null) window.clearTimeout(longPressTimerRef.current);
      if (suppressClickTimerRef.current != null) window.clearTimeout(suppressClickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (book.coverUrl) {
      setPlaceholderUrl(null);
      return;
    }
    coverService
      .getCachedPlaceholderCoverUrl(book.id, book.title, book.fileType, book.author)
      .then((url) => {
        if (!cancelled) setPlaceholderUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPlaceholderUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [book.coverUrl, book.id, book.title, book.fileType, book.author, coverService]);

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDeleteBook(book.id as string);
    } catch (error) {
      appLog.error('[BookCardHover] Error deleting book', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleChangeCoverClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowFolderMenu(false);
    setShowCoverMenu(prev => !prev);
  };

	  const handleAutoCoverLookup = async (e: React.MouseEvent) => {
	    e.preventDefault();
	    e.stopPropagation();

	    if (isUpdatingCover) return;
	    setShowCoverMenu(false);

	    setIsUpdatingCover(true);
	    try {
	      const lookedUp = await coverService.lookupCover(book.title);
	      const coverBlob =
	        lookedUp ??
	        (await coverService.generatePlaceholderCover(book.title, book.fileType, book.author));

	      if (!lookedUp) {
	        toast.info('No cover found online — generated a placeholder cover');
	      }

	      const mime = coverBlob.type || 'image/jpeg';
	      const ext = mime.includes('png')
	        ? 'png'
	        : mime.includes('webp')
	          ? 'webp'
	          : mime.includes('svg')
	            ? 'svg'
	            : 'jpg';
	      const safeBase = (book.title || 'cover')
	        .trim()
        .slice(0, 64)
        .replace(/[^\w]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || 'cover';
      const coverFile = new File([coverBlob], `${safeBase}.${ext}`, { type: mime });

      await onUpdateCover(book.id as string, coverFile);
	    } catch (error) {
	      appLog.error('[BookCardHover] Error looking up cover', error);
	      notifyError(error, { title: 'Failed to find cover' });
	    } finally {
	      setIsUpdatingCover(false);
	    }
	  };

  const triggerCoverFilePicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowCoverMenu(false);
    fileInputRef.current?.click();
  };

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      notifyError('Please select an image file');
      return;
    }

    setIsUpdatingCover(true);
    try {
      await onUpdateCover(book.id as string, file);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      appLog.error('[BookCardHover] Error updating cover', error);
    } finally {
      setIsUpdatingCover(false);
    }
  };

  const handleCardClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (showCoverMenu || showFolderMenu || showMobileActions) {
      setShowCoverMenu(false);
      setShowFolderMenu(false);
      setShowMobileActions(false);
      return;
    }
    onSelectBook(book.id as string);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  const suppressNextCardClick = () => {
    suppressNextClickRef.current = true;
    if (suppressClickTimerRef.current != null) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 1000);
  };

  const openMobileActions = () => {
    setShowCoverMenu(false);
    setShowFolderMenu(false);
    setShowMobileActions(true);
  };

  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile || e.button !== 0) return;

    clearLongPressTimer();
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      suppressNextCardClick();
      openMobileActions();
    }, LONG_PRESS_DELAY_MS);
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (longPressTimerRef.current == null || !longPressStartRef.current) return;

    const deltaX = Math.abs(e.clientX - longPressStartRef.current.x);
    const deltaY = Math.abs(e.clientY - longPressStartRef.current.y);
    if (deltaX > LONG_PRESS_MOVE_THRESHOLD_PX || deltaY > LONG_PRESS_MOVE_THRESHOLD_PX) {
      clearLongPressTimer();
    }
  };

  const handleCardPointerEnd = () => {
    clearLongPressTimer();
  };

  const handleMobileChangeCoverClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMobileActions(false);
    setShowFolderMenu(false);
    setShowCoverMenu(true);
  };

  const handleMobileMoveClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMobileActions(false);
    setShowCoverMenu(false);
    setShowFolderMenu(true);
  };

  const handleMobileEditClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMobileActions(false);
    setShowEditModal(true);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowEditModal(true);
  };

  const handleSaveBook = async (bookId: string, updates: { title?: string; author?: string }) => {
    await updateBookMetadata(bookId, updates);
    if (onBookUpdated) {
      onBookUpdated();
    }
  };

  const handleMoveToFolder = (folderId: string | null) => {
    appLog.debug('handleMoveToFolder called with:', folderId, 'onMoveToFolder exists:', !!onMoveToFolder);
    if (onMoveToFolder) {
      onMoveToFolder(book.id, folderId);
    }
    setShowFolderMenu(false);
  };

  const getCurrentFolderName = () => {
    if (!currentFolderId) return 'No folder';
    const folder = availableFolders.find(f => f.id === currentFolderId);
    return folder ? folder.name : 'Unknown folder';
  };

  const monogram = (book.title || "Book").trim().slice(0, 1).toUpperCase();
  const actionSizeClass = density === "compact" ? "h-7 w-7" : "h-8 w-8";

  return (
    <div
      className="book-item-link relative group cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (!isMobile) {
          setShowCoverMenu(false);
          setShowFolderMenu(false);
        }
      }}
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleCardPointerMove}
      onPointerUp={handleCardPointerEnd}
      onPointerCancel={handleCardPointerEnd}
      onPointerLeave={handleCardPointerEnd}
      onClick={handleCardClick}
      onContextMenu={(e) => {
        if (isMobile) e.preventDefault();
      }}
    >
      <div className="app-card transition-shadow duration-150 hover:shadow-sm">
        {/* Cover Wrapper */}
        <div className="book-cover-wrapper relative aspect-[3/4] overflow-visible">
          <div
            className={`relative h-full w-full overflow-hidden ${book.coverUrl ? "" : "book-cover-placeholder"}`}
          >
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={book.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : placeholderUrl ? (
              <img
                src={placeholderUrl}
                alt={book.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className={`relative z-10 h-full w-full flex flex-col ${density === "compact" ? "p-2" : "p-3"}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="app-chip">{(book.fileType || "file").toUpperCase()}</span>
                </div>

                <div className="flex-1 flex items-center justify-center">
                  <div className="text-4xl font-semibold tracking-tight select-none opacity-80">
                    {monogram}
                  </div>
                </div>

                <div className="text-xs font-medium leading-snug line-clamp-2">
                  {book.title}
                </div>
                {book.author ? (
                  <div className="mt-1 text-[11px] app-muted line-clamp-1">
                    {book.author}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Hover Actions */}
          {!isMobile && (
          <div
            className={`absolute left-2 right-2 top-2 z-30 flex flex-wrap items-start justify-end gap-1 transition-opacity ${
              isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {onMoveToFolder ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowCoverMenu(false);
                  setShowFolderMenu(!showFolderMenu);
                }}
                className={`app-button-muted ${actionSizeClass} shrink-0 rounded-md flex items-center justify-center`}
                title={`Move "${book.title}" to folder`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              </button>
            ) : null}
              <button
                onClick={handleChangeCoverClick}
                disabled={isUpdatingCover}
                className={`app-button-muted ${actionSizeClass} shrink-0 rounded-md flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed`}
                title={`Change cover for "${book.title}"`}
              >
                {isUpdatingCover ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current opacity-70"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16M14 14l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </button>

              <button
                onClick={handleEditClick}
                className={`app-button-muted ${actionSizeClass} shrink-0 rounded-md flex items-center justify-center`}
                title={`Edit details for "${book.title}"`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>

              <button
                onClick={handleDeleteClick}
                disabled={isDeleting}
                className={`app-button-muted ${actionSizeClass} shrink-0 rounded-md flex items-center justify-center text-red-600 hover:text-red-700 disabled:opacity-60 disabled:cursor-not-allowed`}
                title={`Delete "${book.title}"`}
              >
                {isDeleting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current opacity-70"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
          </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverFileChange}
            className="hidden"
            onClick={(e) => e.stopPropagation()}
          />

          {showCoverMenu && !isMobile && (
            <div
              className="absolute top-11 right-2 z-40 w-56 app-card p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={triggerCoverFilePicker}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-[var(--ui-surface-alt)] transition-colors"
              >
                Choose image…
              </button>
              <button
                onClick={handleAutoCoverLookup}
                disabled={isUpdatingCover}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-[var(--ui-surface-alt)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Find cover automatically
              </button>
            </div>
          )}

          {showMobileActions && isMobile && (
            <div
              className="fixed inset-0 z-50 bg-black/40 flex items-end"
              onClick={(e) => {
                e.stopPropagation();
                setShowMobileActions(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                className="w-full app-card rounded-t-lg p-3"
                role="dialog"
                aria-modal="true"
                aria-label={`Actions for ${book.title}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--ui-border)]" />
                <div className="px-3 py-2">
                  <div className="text-sm font-semibold line-clamp-2">{book.title}</div>
                  <div className="text-xs app-muted mt-1">{getCurrentFolderName()}</div>
                </div>
                {onMoveToFolder ? (
                  <button
                    onClick={handleMobileMoveClick}
                    className="w-full text-left px-3 py-3 rounded-md text-sm hover:bg-[var(--ui-surface-alt)] transition-colors"
                  >
                    Move to folder
                  </button>
                ) : null}
                <button
                  onClick={handleMobileChangeCoverClick}
                  disabled={isUpdatingCover}
                  className="w-full text-left px-3 py-3 rounded-md text-sm hover:bg-[var(--ui-surface-alt)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Change cover
                </button>
                <button
                  onClick={handleMobileEditClick}
                  className="w-full text-left px-3 py-3 rounded-md text-sm hover:bg-[var(--ui-surface-alt)] transition-colors"
                >
                  Edit details
                </button>
                <button
                  onClick={(e) => {
                    setShowMobileActions(false);
                    void handleDeleteClick(e);
                  }}
                  disabled={isDeleting}
                  className="w-full text-left px-3 py-3 rounded-md text-sm text-red-600 hover:bg-[var(--ui-surface-alt)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Delete book
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMobileActions(false);
                  }}
                  className="w-full text-left px-3 py-3 rounded-md text-sm app-muted hover:bg-[var(--ui-surface-alt)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showCoverMenu && isMobile && (
            <div
              className="fixed inset-0 z-50 bg-black/40 flex items-end"
              onClick={(e) => {
                e.stopPropagation();
                setShowCoverMenu(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                className="w-full app-card rounded-t-2xl p-3"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--ui-border)]" />
                <button
                  onClick={triggerCoverFilePicker}
                  className="w-full text-left px-3 py-3 rounded-md text-sm hover:bg-[var(--ui-surface-alt)] transition-colors"
                >
                  Choose image…
                </button>
                <button
                  onClick={handleAutoCoverLookup}
                  disabled={isUpdatingCover}
                  className="w-full text-left px-3 py-3 rounded-md text-sm hover:bg-[var(--ui-surface-alt)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Find cover automatically
                </button>
                <button
                  onClick={() => setShowCoverMenu(false)}
                  className="w-full text-left px-3 py-3 rounded-md text-sm app-muted hover:bg-[var(--ui-surface-alt)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Folder Menu Dropdown */}
          {onMoveToFolder && showFolderMenu && !isMobile && (
            <div
              className="absolute top-11 left-2 z-40 min-w-52 app-card p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-1.5 text-[11px] app-muted">
                Current: <span className="text-[color:var(--ui-text)]">{getCurrentFolderName()}</span>
              </div>
              <div className="mt-1">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleMoveToFolder(null);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-sm app-nav-item ${
                    !currentFolderId ? "app-nav-active" : ""
                  }`}
                >
                  No folder
                </button>
                {availableFolders.length > 0 ? (
                  availableFolders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleMoveToFolder(folder.id);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-sm app-nav-item ${
                        currentFolderId === folder.id ? "app-nav-active" : ""
                      }`}
                    >
                      {folder.name}
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm app-muted">
                    No folders
                  </div>
                )}
              </div>
            </div>
          )}

          {onMoveToFolder && showFolderMenu && isMobile && (
            <div
              className="fixed inset-0 z-50 bg-black/40 flex items-end"
              onClick={(e) => {
                e.stopPropagation();
                setShowFolderMenu(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                className="w-full app-card rounded-t-lg p-3"
                role="dialog"
                aria-modal="true"
                aria-label={`Move ${book.title} to folder`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--ui-border)]" />
                <div className="px-3 py-2">
                  <div className="text-sm font-semibold">Move to folder</div>
                  <div className="text-xs app-muted mt-1">
                    Current: <span className="text-[color:var(--ui-text)]">{getCurrentFolderName()}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleMoveToFolder(null);
                  }}
                  className={`w-full text-left px-3 py-3 rounded-md text-sm app-nav-item ${
                    !currentFolderId ? "app-nav-active" : ""
                  }`}
                >
                  No folder
                </button>
                {availableFolders.length > 0 ? (
                  availableFolders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleMoveToFolder(folder.id);
                      }}
                      className={`w-full text-left px-3 py-3 rounded-md text-sm app-nav-item ${
                        currentFolderId === folder.id ? "app-nav-active" : ""
                      }`}
                    >
                      {folder.name}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-3 text-sm app-muted">
                    No folders
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowFolderMenu(false);
                  }}
                  className="w-full text-left px-3 py-3 rounded-md text-sm app-muted hover:bg-[var(--ui-surface-alt)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Book Info */}
        <div className={density === "compact" ? "p-2" : "p-3"}>
          <h3 className={`book-item-title font-semibold mb-1 line-clamp-2 ${density === "compact" ? "text-sm" : ""}`}>
            {book.title}
          </h3>
          <div className="flex items-center justify-between text-xs app-muted">
            <span>{(book.fileType || "file").toUpperCase()}</span>
            <span>{book.totalChapters || 1} ch</span>
          </div>
          <div className="text-xs app-muted mt-1">
            {book.uploadedAt ? new Date(book.uploadedAt).toLocaleDateString() : 'Unknown date'}
          </div>
        </div>
      </div>

      {showEditModal && (
        <EditBookModal
          book={book}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveBook}
        />
      )}
    </div>
  );
}
