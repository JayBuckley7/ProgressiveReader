import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import type { BookMetadata, Folder } from "~/types";
import { notifyError } from "@shared/utils/notify";
import { bookMetadataService } from "@features/books/services/bookMetadata";

export function createFolderActions(params: {
  clerkUser: unknown | null;
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  setBooks: Dispatch<SetStateAction<BookMetadata[]>>;
}) {
  const { clerkUser, setFolders, setBooks } = params;

  const ensureUser = () => {
    if (!clerkUser) {
      notifyError("Please sign in to manage folders");
      return false;
    }
    return true;
  };

  const createFolder = async (name: string, parentId?: string) => {
    if (!ensureUser()) return;
    try {
      const newFolder = await bookMetadataService.createFolder(name, parentId, clerkUser);
      setFolders((current) => [...current, newFolder]);
      toast.success(`Folder "${name}" created successfully`);
    } catch (error) {
      notifyError(error, { title: "Failed to create folder" });
    }
  };

  const updateFolder = async (folderId: string, updates: { name?: string; parentId?: string }) => {
    if (!ensureUser()) return;
    try {
      const updatedFolder = await bookMetadataService.updateFolder(folderId, updates, clerkUser);
      setFolders((current) => current.map((folder) => (folder.id === folderId ? updatedFolder : folder)));
      toast.success("Folder updated successfully");
    } catch (error) {
      notifyError(error, { title: "Failed to update folder" });
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!ensureUser()) return;
    try {
      await bookMetadataService.deleteFolder(folderId, clerkUser);
      setFolders((current) => current.filter((folder) => folder.id !== folderId));
      toast.success("Folder deleted successfully");
    } catch (error) {
      notifyError(error, { title: "Failed to delete folder" });
    }
  };

  const moveBookToFolder = async (bookId: string, folderId: string | null) => {
    if (!ensureUser()) return;
    try {
      await bookMetadataService.moveBookToFolder(bookId, folderId, clerkUser);
      setBooks((current) =>
        current.map((book) => (book.id === bookId ? { ...book, folderId: folderId ?? undefined } : book))
      );
      toast.success("Book moved successfully");
    } catch (error) {
      notifyError(error, { title: "Failed to move book" });
    }
  };

  return { createFolder, updateFolder, deleteFolder, moveBookToFolder };
}
