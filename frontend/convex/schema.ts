import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  books: defineTable({
    title: v.string(),
    author: v.optional(v.string()),
    language: v.string(),
    totalChapters: v.number(),
    coverImageId: v.optional(v.id("_storage")),
    epubFileId: v.id("_storage"),
    uploadedBy: v.id("users"),
  }).index("by_user", ["uploadedBy"]),

  chapters: defineTable({
    bookId: v.id("books"),
    chapterIndex: v.number(),
    title: v.string(),
    content: v.string(),
    wordCount: v.number(),
  }).index("by_book", ["bookId", "chapterIndex"]),

  readingProgress: defineTable({
    userId: v.id("users"),
    bookId: v.id("books"),
    currentChapter: v.number(),
    currentPosition: v.number(), // scroll position or word index
    lastReadAt: v.number(),
    totalReadingTime: v.number(), // in seconds
  }).index("by_user_book", ["userId", "bookId"]),

  userSettings: defineTable({
    userId: v.id("users"),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    fontSize: v.number(),
    fontFamily: v.string(),
    ttsSpeed: v.number(),
    jlptEnabled: v.boolean(),
    autoTranslate: v.boolean(),
    targetLanguage: v.string(),
    customCss: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  translations: defineTable({
    bookId: v.id("books"),
    chapterIndex: v.number(),
    originalText: v.string(),
    translatedText: v.string(),
    language: v.string(),
    model: v.string(),
    createdBy: v.id("users"),
  }).index("by_book_chapter", ["bookId", "chapterIndex"]),

  bookmarks: defineTable({
    userId: v.id("users"),
    bookId: v.id("books"),
    chapterIndex: v.number(),
    position: v.number(),
    note: v.optional(v.string()),
    highlightedText: v.optional(v.string()),
  }).index("by_user_book", ["userId", "bookId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
