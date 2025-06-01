import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const books = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("uploadedBy", userId))
      .collect();

    return Promise.all(
      books.map(async (book) => ({
        ...book,
        coverUrl: book.coverImageId ? await ctx.storage.getUrl(book.coverImageId) : null,
      }))
    );
  },
});

export const get = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const book = await ctx.db.get(args.bookId);
    if (!book || book.uploadedBy !== userId) return null;

    return {
      ...book,
      coverUrl: book.coverImageId ? await ctx.storage.getUrl(book.coverImageId) : null,
    };
  },
});

export const getChapter = query({
  args: { 
    bookId: v.id("books"), 
    chapterIndex: v.number() 
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const book = await ctx.db.get(args.bookId);
    if (!book || book.uploadedBy !== userId) return null;

    const chapter = await ctx.db
      .query("chapters")
      .withIndex("by_book", (q) => 
        q.eq("bookId", args.bookId).eq("chapterIndex", args.chapterIndex)
      )
      .unique();

    return chapter;
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    author: v.optional(v.string()),
    language: v.string(),
    totalChapters: v.number(),
    epubFileId: v.id("_storage"),
    coverImageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.db.insert("books", {
      ...args,
      uploadedBy: userId,
    });
  },
});

export const updateMetadata = mutation({
  args: {
    bookId: v.id("books"),
    title: v.string(),
    author: v.optional(v.string()),
    totalChapters: v.number(),
    coverImageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const book = await ctx.db.get(args.bookId);
    if (!book || book.uploadedBy !== userId) {
      throw new Error("Book not found or access denied");
    }

    await ctx.db.patch(args.bookId, {
      title: args.title,
      author: args.author,
      totalChapters: args.totalChapters,
      coverImageId: args.coverImageId,
    });
  },
});

export const createChapter = mutation({
  args: {
    bookId: v.id("books"),
    chapterIndex: v.number(),
    title: v.string(),
    content: v.string(),
    wordCount: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const book = await ctx.db.get(args.bookId);
    if (!book || book.uploadedBy !== userId) {
      throw new Error("Book not found or access denied");
    }

    return await ctx.db.insert("chapters", {
      bookId: args.bookId,
      chapterIndex: args.chapterIndex,
      title: args.title,
      content: args.content,
      wordCount: args.wordCount,
    });
  },
});
