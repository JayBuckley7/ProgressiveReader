import type { ClerkAuthPort } from "@core/auth/ports";
import type { BackendFetchPort } from "@core/backend/fetchPort";
import type {
  AdminBackendPort,
  BookmarksBackendPort,
  CoversBackendPort,
  GrammarBackendPort,
  JlptBackendPort,
  LyricsBackendPort,
  MixBackendPort,
  OcrBackendPort,
  OpenAiKeyBackendPort,
  TranslationBackendPort,
  VocabularyBackendPort,
} from "@core/backend/ports";
import type { LlmChatPort } from "@core/llm/ports";
import type { PreferencesPort } from "@core/prefs/ports";
import type { DriveAuthPort } from "@core/drive/authPort";
import type { DriveCachePort } from "@core/drive/cachePort";
import type { DrivePort } from "@core/drive/ports";
import type { TranslationCachePort } from "@core/translation/cachePort";

export type AppDeps = {
  auth: ClerkAuthPort;
  prefs: PreferencesPort;
  translationCache: TranslationCachePort;

  llmChat: LlmChatPort;

  backendFetch: BackendFetchPort;
  backend: {
    translation: TranslationBackendPort;
    grammar: GrammarBackendPort;
    mix: MixBackendPort;
    ocr: OcrBackendPort;
    admin: AdminBackendPort;
    bookmarks: BookmarksBackendPort;
    vocabulary: VocabularyBackendPort;
    covers: CoversBackendPort;
    openaiKey: OpenAiKeyBackendPort;
    jlpt: JlptBackendPort;
    lyrics: LyricsBackendPort;
  };

  drive: DrivePort;
  driveCache: DriveCachePort;
  driveAuth: DriveAuthPort;
};

