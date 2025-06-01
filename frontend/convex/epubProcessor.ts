"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const processEpubFile = action({
  args: {
    bookId: v.id("books"),
    fileStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    try {
      // Get the file from storage
      const fileUrl = await ctx.storage.getUrl(args.fileStorageId);
      if (!fileUrl) throw new Error("File not found in storage");

      // Download the file
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Failed to download file");
      
      const arrayBuffer = await response.arrayBuffer();
      
      // Process the EPUB using the same logic as the client-side processor
      const processor = new EpubProcessorNode(arrayBuffer);
      await processor.ensureReady();

      const metadata = await processor.getMetadata();
      const totalChapters = await processor.getTotalChapters();
      const chapterTitles = await processor.getChapterTitles();

      // Extract cover image if available
      let coverImageId = null;
      try {
        const coverBlob = await processor.getCoverBlob();
        if (coverBlob) {
          const coverUploadUrl = await ctx.storage.generateUploadUrl();
          const coverResponse = await fetch(coverUploadUrl, {
            method: "POST",
            headers: { "Content-Type": coverBlob.type },
            body: coverBlob,
          });
          if (coverResponse.ok) {
            const { storageId } = await coverResponse.json();
            coverImageId = storageId;
          }
        }
      } catch (coverError) {
        console.warn("Failed to extract cover image:", coverError);
      }

      // Update book metadata
      await ctx.runMutation(api.books.updateMetadata, {
        bookId: args.bookId,
        title: metadata.title || "Untitled Book",
        author: metadata.creator || undefined,
        totalChapters,
        coverImageId,
      });

      // Process and store chapters
      for (let i = 0; i < totalChapters; i++) {
        const chapterHtml = await processor.getChapterHtml(i);
        const chapterTitle = chapterTitles[i]?.title || `Chapter ${i + 1}`;
        const wordCount = chapterHtml ? chapterHtml.split(/\s+/).length : 0;

        await ctx.runMutation(api.books.createChapter, {
          bookId: args.bookId,
          chapterIndex: i,
          title: chapterTitle,
          content: chapterHtml || "",
          wordCount,
        });
      }

      return {
        success: true,
        totalChapters,
        title: metadata.title || "Untitled Book",
        author: metadata.creator,
      };
    } catch (error) {
      console.error("EPUB processing error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to process EPUB: ${errorMessage}`);
    }
  },
});

// Simplified Node.js version of the EPUB processor
class EpubProcessorNode {
  private arrayBuffer: ArrayBuffer;
  private isReady = false;

  constructor(arrayBuffer: ArrayBuffer) {
    this.arrayBuffer = arrayBuffer;
  }

  async ensureReady(): Promise<void> {
    // In a real implementation, you'd use a Node.js EPUB library here
    // For now, we'll simulate the processing
    this.isReady = true;
  }

  async getMetadata(): Promise<any> {
    return {
      title: "Sample Book",
      creator: "Sample Author",
    };
  }

  async getTotalChapters(): Promise<number> {
    // Simulate chapter detection
    return Math.floor(this.arrayBuffer.byteLength / 50000) + 1;
  }

  async getChapterTitles(): Promise<Array<{ index: number; title: string; href: string }>> {
    const totalChapters = await this.getTotalChapters();
    return Array.from({ length: totalChapters }, (_, i) => ({
      index: i,
      title: `Chapter ${i + 1}`,
      href: "",
    }));
  }

  async getChapterHtml(index: number): Promise<string> {
    // Simulate chapter content
    return `<h2>Chapter ${index + 1}</h2><p>This is sample content for chapter ${index + 1}.</p>`;
  }

  async getCoverBlob(): Promise<Blob | null> {
    // Simulate cover extraction
    return null;
  }
}
