import { appLog } from "@shared/appLog";
import type { DrivePort } from "@core/drive/ports";
import type { JlptCatalogTest, JlptTestData, LocalJlptManifest } from "@features/jlpt/types";
import { JLPT_LEVELS, extractJlptLevel } from "@features/jlpt/services/jlptConfig";

export type TestFile = JlptCatalogTest;

const LEGACY_LOCAL_TEST_NAMES = ["JLPTN3_Test1.json", "JLPTN3_Test2.json", "JLPTN3_Test3.json", "JLPTN5_Test1.json"];

function compareTests(a: JlptCatalogTest, b: JlptCatalogTest): number {
  const levelOrder = JLPT_LEVELS.indexOf(a.level) - JLPT_LEVELS.indexOf(b.level);
  if (levelOrder !== 0) return levelOrder;
  return a.name.localeCompare(b.name);
}

function normalizeManifestTest(value: LocalJlptManifest["tests"][number]): JlptCatalogTest | null {
  const level = extractJlptLevel(value.level, { level: value.level });
  if (!level) return null;
  return {
    id: value.id,
    name: value.name,
    level,
    source: "local",
    path: value.path,
  };
}

class JLPTTestService {
  async scanLibraryForTests(drive: DrivePort): Promise<JlptCatalogTest[]> {
    try {
      if (!drive.isSignedIn()) return [];

      const files = await drive.listFiles();
      return files
        .filter((file) => {
          const name = String(file?.name || "").toLowerCase();
          return name.endsWith(".json") && (name.includes("jlpt") || name.includes("test"));
        })
        .map((file) => {
          const name = String(file.name || "");
          const level = extractJlptLevel(name);
          if (!level) {
            appLog.warn("[jlptTestService] Skipping Drive test without JLPT level", { name });
            return null;
          }
          return {
            id: String(file.id),
            name,
            level,
            source: "library" as const,
          };
        })
        .filter((file): file is JlptCatalogTest => Boolean(file))
        .sort(compareTests);
    } catch (error) {
      appLog.error("[jlptTestService] Error scanning library for tests", error);
      return [];
    }
  }

  private async loadLocalManifest(): Promise<JlptCatalogTest[]> {
    try {
      const response = await fetch("/JLPT_Tests/manifest.json", { cache: "no-store" });
      if (!response.ok) return [];
      const manifest = (await response.json()) as LocalJlptManifest;
      if (!Array.isArray(manifest?.tests)) return [];
      return manifest.tests.map(normalizeManifestTest).filter((test): test is JlptCatalogTest => Boolean(test)).sort(compareTests);
    } catch (error) {
      appLog.warn("[jlptTestService] Failed to load JLPT manifest, falling back to legacy discovery", error);
      return [];
    }
  }

  async scanLocalTests(): Promise<JlptCatalogTest[]> {
    try {
      const manifestTests = await this.loadLocalManifest();
      if (manifestTests.length > 0) return manifestTests;

      const testFiles: JlptCatalogTest[] = [];
      for (const name of LEGACY_LOCAL_TEST_NAMES) {
        try {
          const response = await fetch(`/JLPT_Tests/${name}`, { method: "HEAD" });
          if (!response.ok) continue;
          const level = extractJlptLevel(name);
          if (!level) continue;
          testFiles.push({
            id: name,
            name,
            level,
            source: "local",
            path: `/JLPT_Tests/${name}`,
          });
        } catch {
          // ignore per-file fetch failures
        }
      }

      return testFiles.sort(compareTests);
    } catch (error) {
      appLog.error("[jlptTestService] Error scanning local tests", error);
      return [];
    }
  }

  async getAllTests(drive: DrivePort): Promise<JlptCatalogTest[]> {
    const [libraryTests, localTests] = await Promise.all([this.scanLibraryForTests(drive), this.scanLocalTests()]);
    return [...libraryTests, ...localTests].sort(compareTests);
  }

  async loadTestData(drive: DrivePort, testFile: JlptCatalogTest): Promise<JlptTestData> {
    try {
      let data: any;
      if (testFile.source === "library") {
        const blob = await drive.downloadFile(testFile.id);
        if (!blob) throw new Error("Drive returned empty file");
        const text = await blob.text();
        data = JSON.parse(text);
      } else {
        const response = await fetch(testFile.path!);
        if (!response.ok) throw new Error(`Failed to load test file: ${testFile.name}`);
        data = await response.json();
      }

      if (data && typeof data === "object" && !Array.isArray(data) && data.questions) {
        return {
          questions: Array.isArray(data.questions) ? data.questions : [],
          meta: data.meta || null,
        };
      }

      if (Array.isArray(data)) {
        return {
          questions: data,
          meta: null,
        };
      }

      throw new Error("Invalid test file format");
    } catch (error) {
      appLog.error("[jlptTestService] Error loading test data", error);
      throw new Error(`Failed to load test: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

export const jlptTestService = new JLPTTestService();
