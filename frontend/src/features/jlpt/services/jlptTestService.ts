import { gDriveService } from '@integrations/googleDrive/gdriveService';

export interface TestFile {
  name: string;
  id: string;
  source: 'library' | 'local';
  path?: string;
}

/**
 * Service to find JLPT test JSON files from library or local folder
 */
class JLPTTestService {
  /**
   * Scan for JSON test files in the library (Google Drive)
   */
  async scanLibraryForTests(): Promise<TestFile[]> {
    try {
      if (!gDriveService.isSignedIn()) {
        return [];
      }

      // List all files in Google Drive
      const files = await gDriveService.listFiles();
      
      // Filter for JSON files that match JLPT test naming pattern
      const testFiles: TestFile[] = files
        .filter(file => {
          const name = file.name.toLowerCase();
          return name.endsWith('.json') && 
                 (name.includes('jlpt') || name.includes('test'));
        })
        .map(file => ({
          name: file.name,
          id: file.id,
          source: 'library' as const,
        }));

      return testFiles;
    } catch (error) {
      console.error('Error scanning library for tests:', error);
      return [];
    }
  }

  /**
   * Scan local JLPT_Tests folder for JSON files
   */
  async scanLocalTests(): Promise<TestFile[]> {
    try {
      // Try to fetch from the JLPT_Tests folder
      const testFiles: TestFile[] = [];
      
      // Common test file names
      const commonNames = [
        'JLPTN3_Test1.json',
        'JLPTN3_Test2.json',
        'JLPTN3_Test3.json',
        'JLPTN5_Test1.json',
      ];

      // Check if files exist by trying to fetch them
      for (const name of commonNames) {
        try {
          const response = await fetch(`/JLPT_Tests/${name}`);
          if (response.ok) {
            testFiles.push({
              name,
              id: name,
              source: 'local',
              path: `/JLPT_Tests/${name}`,
            });
          }
        } catch (e) {
          // File doesn't exist, skip
        }
      }

      return testFiles;
    } catch (error) {
      console.error('Error scanning local tests:', error);
      return [];
    }
  }

  /**
   * Get all available tests from both library and local sources
   */
  async getAllTests(): Promise<TestFile[]> {
    const [libraryTests, localTests] = await Promise.all([
      this.scanLibraryForTests(),
      this.scanLocalTests(),
    ]);

    return [...libraryTests, ...localTests];
  }

  /**
   * Load test data from a test file
   */
  async loadTestData(testFile: TestFile): Promise<any[]> {
    try {
      if (testFile.source === 'library') {
        // Download from Google Drive
        const blob = await gDriveService.downloadFile(testFile.id);
        const text = await blob.text();
        return JSON.parse(text);
      } else {
        // Load from local path
        const response = await fetch(testFile.path!);
        if (!response.ok) {
          throw new Error(`Failed to load test file: ${testFile.name}`);
        }
        return await response.json();
      }
    } catch (error) {
      console.error('Error loading test data:', error);
      throw new Error(`Failed to load test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const jlptTestService = new JLPTTestService();

