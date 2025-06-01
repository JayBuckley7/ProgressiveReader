import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: { language: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    
    let query = ctx.db.query("vocabulary").withIndex("by_user", (q) => q.eq("userId", userId));
    
    if (args.language) {
      query = ctx.db.query("vocabulary").withIndex("by_user_and_language", (q) => 
        q.eq("userId", userId).eq("language", args.language!)
      );
    }
    
    return await query.collect();
  },
});

export const addWord = mutation({
  args: {
    word: v.string(),
    translation: v.string(),
    language: v.string(),
    bookId: v.optional(v.id("books")),
    context: v.optional(v.string()),
    difficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in");
    }
    
    return await ctx.db.insert("vocabulary", {
      ...args,
      userId,
      mastered: false,
    });
  },
});

export const toggleMastered = mutation({
  args: { wordId: v.id("vocabulary") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in");
    }
    
    const word = await ctx.db.get(args.wordId);
    if (!word || word.userId !== userId) {
      throw new Error("Word not found");
    }
    
    await ctx.db.patch(args.wordId, {
      mastered: !word.mastered,
    });
  },
});
