import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { EpubProcessorWrapper } from "../lib/epubProcessor";

interface AddBookModalProps {
  onClose: () => void;
}

export function AddBookModal({ onClose }: AddBookModalProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState("English");
  const [description, setDescription] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const addBook = useMutation(api.books.addBook);
  const generateUploadUrl = useMutation(api.books.generateUploadUrl);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const allowedTypes = [
      'application/epub+zip',
      'application/pdf',
      'application/x-mobipocket-ebook',
      'text/plain'
    ];
    
    const isValidType = allowedTypes.includes(selectedFile.type) || 
      selectedFile.name.toLowerCase().endsWith('.epub') ||
      selectedFile.name.toLowerCase().endsWith('.mobi') ||
      selectedFile.name.toLowerCase().endsWith('.pdf') ||
      selectedFile.name.toLowerCase().endsWith('.txt');

    if (!isValidType) {
      toast.error("Please select an EPUB, PDF, MOBI, or TXT file");
      return;
    }
    
    setFile(selectedFile);
    
    // Auto-fill title from filename if empty
    if (!title) {
      const filename = selectedFile.name.replace(/\.[^/.]+$/, "");
      setTitle(filename);
    }

    // Process EPUB files to extract metadata
    if (selectedFile.name.toLowerCase().endsWith('.epub')) {
      setIsProcessing(true);
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const epubProcessor = new EpubProcessorWrapper();
        const success = await epubProcessor.loadBook(arrayBuffer);
        
        if (success) {
          const metadata = epubProcessor.getMetadata();
          if (metadata?.title && !title) {
            setTitle(metadata.title);
          }
          if (metadata?.creator && !author) {
            setAuthor(Array.isArray(metadata.creator) ? metadata.creator[0] : metadata.creator);
          }
          if (metadata?.description && !description) {
            setDescription(metadata.description);
          }
          if (metadata?.language && language === "English") {
            const lang = metadata.language.toLowerCase();
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
            setLanguage(languageMap[lang] || 'Other');
          }
          if (epubProcessor.getTotalChapters() && !totalPages) {
            setTotalPages(epubProcessor.getTotalChapters().toString());
          }
          toast.success("EPUB metadata extracted successfully!");
        }
      } catch (error) {
        console.error("Error processing EPUB:", error);
        toast.error("Could not extract EPUB metadata, but you can still upload the file");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) {
      toast.error("Title and author are required");
      return;
    }

    setIsSubmitting(true);
    try {
      let fileId = undefined;
      
      if (file) {
        // Upload file to Convex storage
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        
        if (!result.ok) {
          throw new Error("Failed to upload file");
        }
        
        const json = await result.json();
        fileId = json.storageId;
      }

      await addBook({
        title: title.trim(),
        author: author.trim(),
        language,
        description: description.trim() || undefined,
        totalPages: totalPages ? parseInt(totalPages) : undefined,
        fileId,
      });
      
      toast.success("Book uploaded successfully!");
      onClose();
    } catch (error) {
      toast.error("Failed to upload book");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Upload New Book</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Book File
              </label>
              <input
                type="file"
                accept=".epub,.pdf,.mobi,.txt,application/epub+zip,application/pdf,application/x-mobipocket-ebook,text/plain"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                disabled={isProcessing}
              />
              <p className="text-xs text-gray-500 mt-1">
                Supported formats: EPUB, PDF, MOBI, TXT
              </p>
              {isProcessing && (
                <p className="text-xs text-blue-600 mt-1 flex items-center">
                  <span className="animate-spin mr-2">⏳</span>
                  Processing EPUB metadata...
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Enter book title"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Author *
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Enter author name"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="Chinese">Chinese</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Pages/Chapters
              </label>
              <input
                type="number"
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Number of pages or chapters"
                min="1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                placeholder="Brief description of the book"
              />
            </div>
            
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isProcessing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Uploading..." : isProcessing ? "Processing..." : "Upload Book"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
