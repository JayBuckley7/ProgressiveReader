import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return settings || {
      theme: "system" as const,
      fontSize: 16,
      fontFamily: "Inter",
      ttsSpeed: 1.0,
      jlptEnabled: false,
      autoTranslate: false,
      targetLanguage: "English",
    };
  },
});

export const update = mutation({
  args: {
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
    fontSize: v.optional(v.number()),
    fontFamily: v.optional(v.string()),
    ttsSpeed: v.optional(v.number()),
    jlptEnabled: v.optional(v.boolean()),
    autoTranslate: v.optional(v.boolean()),
    targetLanguage: v.optional(v.string()),
    customCss: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const updates = Object.fromEntries(
      Object.entries(args).filter(([_, value]) => value !== undefined)
    );

    if (existing) {
      await ctx.db.patch(existing._id, updates);
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        theme: "system",
        fontSize: 16,
        fontFamily: "Inter",
        ttsSpeed: 1.0,
        jlptEnabled: false,
        autoTranslate: false,
        targetLanguage: "English",
        ...updates,
      });
    }
  },
});
