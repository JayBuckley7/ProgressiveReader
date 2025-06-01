import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getProgress = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const progress = await ctx.db
      .query("readingProgress")
      .withIndex("by_user_book", (q) => 
        q.eq("userId", userId).eq("bookId", args.bookId)
      )
      .unique();

    return progress;
  },
});

export const updateProgress = mutation({
  args: {
    bookId: v.id("books"),
    currentChapter: v.number(),
    currentPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("readingProgress")
      .withIndex("by_user_book", (q) => 
        q.eq("userId", userId).eq("bookId", args.bookId)
      )
      .unique();

    const now = Date.now();

    if (existing) {
      const timeDiff = Math.max(0, (now - existing.lastReadAt) / 1000);
      const additionalTime = timeDiff < 300 ? timeDiff : 0; // Only count if less than 5 minutes

      await ctx.db.patch(existing._id, {
        currentChapter: args.currentChapter,
        currentPosition: args.currentPosition,
        lastReadAt: now,
        totalReadingTime: existing.totalReadingTime + additionalTime,
      });
    } else {
      await ctx.db.insert("readingProgress", {
        userId,
        bookId: args.bookId,
        currentChapter: args.currentChapter,
        currentPosition: args.currentPosition,
        lastReadAt: now,
        totalReadingTime: 0,
      });
    }
  },
});

export const getBookmarks = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("bookmarks")
      .withIndex("by_user_book", (q) => 
        q.eq("userId", userId).eq("bookId", args.bookId)
      )
      .collect();
  },
});

export const addBookmark = mutation({
  args: {
    bookId: v.id("books"),
    chapterIndex: v.number(),
    position: v.number(),
    note: v.optional(v.string()),
    highlightedText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.db.insert("bookmarks", {
      userId,
      ...args,
    });
  },
});
