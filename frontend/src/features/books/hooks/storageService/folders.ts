import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import type { BookMetadata, Folder } from "~/types";
import { notifyError } from "@shared/utils/notify";
import type { DriveAuthPort } from "@core/drive/authPort";
import type { DrivePort } from "@core/drive/ports";
import {
  createFolderOnDrive,
  deleteFolderOnDrive,
  moveBookToFolderOnDrive,
  updateFolderOnDrive,
} from "@features/books/services/bookLibrary/manage";

export function createFolderActions(params: {
  clerkUser: unknown | null;
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  setBooks: Dispatch<SetStateAction<BookMetadata[]>>;
}) {
  const { clerkUser, drive, driveAuth, setFolders, setBooks } = params;

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
      const newFolder = await createFolderOnDrive({ drive, driveAuth, name, parentId, clerkUser: clerkUser as any });
      setFolders((current) => [...current, newFolder]);
      toast.success(`Folder "${name}" created successfully`);
    } catch (error) {
      notifyError(error, { title: "Failed to create folder" });
    }
  };

  const updateFolder = async (folderId: string, updates: { name?: string; parentId?: string }) => {
    if (!ensureUser()) return;
    try {
      const updatedFolder = await updateFolderOnDrive({ drive, driveAuth, folderId, updates, clerkUser: clerkUser as any });
      setFolders((current) => current.map((folder) => (folder.id === folderId ? updatedFolder : folder)));
      toast.success("Folder updated successfully");
    } catch (error) {
      notifyError(error, { title: "Failed to update folder" });
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!ensureUser()) return;
    try {
      await deleteFolderOnDrive({ drive, driveAuth, folderId, clerkUser: clerkUser as any });
      setFolders((current) => current.filter((folder) => folder.id !== folderId));
      toast.success("Folder deleted successfully");
    } catch (error) {
      notifyError(error, { title: "Failed to delete folder" });
    }
  };

  const moveBookToFolder = async (bookId: string, folderId: string | null) => {
    if (!ensureUser()) return;
    try {
      await moveBookToFolderOnDrive({ drive, driveAuth, bookId, folderId, clerkUser: clerkUser as any });
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
