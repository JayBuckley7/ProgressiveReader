import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { BookReader } from "./BookReader";

interface Book {
  _id: Id<"books">;
  title: string;
  author: string;
  language: string;
  coverUrl?: string;
  totalPages?: number;
  description?: string;
  fileId?: Id<"_storage">;
}

interface BookCardProps {
  book: Book;
}

export function BookCard({ book }: BookCardProps) {
  const [showReader, setShowReader] = useState(false);
  const progress = useQuery(api.books.getReadingProgress, { bookId: book._id });
  const deleteBook = useMutation(api.books.delete);
  const updateCover = useMutation(api.books.updateCover);
  const generateUploadUrl = useMutation(api.books.generateUploadUrl);
  const coverInputRef = useRef<HTMLInputElement>(null);
  
  const progressPercentage = progress && book.totalPages 
    ? Math.round((progress.currentPage / progress.totalPages) * 100)
    : 0;

  const handleOpenBook = () => {
    if (book.fileId) {
      setShowReader(true);
    } else {
      console.log("No file available for:", book.title);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${book.title}"?`)) return;
    try {
      await deleteBook({ bookId: book._id });
    } catch (err) {
      console.error("Failed to delete book", err);
    }
  };

  const handleCoverChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      await updateCover({ bookId: book._id, coverImageId: storageId });
    } catch (err) {
      console.error("Failed to update cover", err);
    } finally {
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  if (showReader) {
    return <BookReader bookId={book._id} onClose={() => setShowReader(false)} />;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow cursor-pointer group relative">
      <input
        type="file"
        accept="image/*"
        ref={coverInputRef}
        className="hidden"
        onChange={handleCoverChange}
      />
      <button
        onClick={handleDelete}
        className="absolute top-2 right-2 bg-red-600 text-white text-xs rounded-full w-6 h-6 hidden group-hover:flex items-center justify-center"
      >
        ×
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          coverInputRef.current?.click();
        }}
        className="absolute top-2 left-2 bg-white text-gray-700 text-xs rounded-full w-6 h-6 hidden group-hover:flex items-center justify-center"
      >
        📷
      </button>
      <div onClick={handleOpenBook}>
        <div className="aspect-[3/4] bg-gradient-to-br from-blue-100 to-purple-100 rounded-t-lg flex items-center justify-center relative overflow-hidden">
          {book.coverUrl ? (
            <img 
              src={book.coverUrl} 
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center p-4">
              <div className="text-4xl mb-2">📖</div>
              <div className="text-sm font-medium text-gray-700 line-clamp-3">
                {book.title}
              </div>
            </div>
          )}
          
          {progressPercentage > 0 && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2">
              <div className="flex justify-between items-center mb-1">
                <span>{progressPercentage}% complete</span>
                <span>{progress?.currentPage}/{progress?.totalPages}</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-1">
                <div 
                  className="bg-white rounded-full h-1 transition-all"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          )}

          {!book.fileId && (
            <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
              No file
            </div>
          )}
        </div>
        
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-blue-600 transition-colors">
            {book.title}
          </h3>
          <p className="text-sm text-gray-600 mb-2">{book.author}</p>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {book.language}
            </span>
            {book.totalPages && (
              <span className="text-xs text-gray-500">{book.totalPages} pages</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
