const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser } = require('xmldom');
const os = require('os');

// --- Temp directory helper ---
const getTempDir = () => {
    const tempDir = path.join(os.tmpdir(), `epub-test-${Date.now()}`);
    if (!fsSync.existsSync(tempDir)) {
        fsSync.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
};

// --- EPUB Processing Functions ---
async function readContainerXml(zip) {
    const containerEntry = zip.file('META-INF/container.xml');
    if (!containerEntry) {
        throw new Error('container.xml not found in EPUB');
    }
    
    const containerXml = await containerEntry.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(containerXml, 'application/xml');
    
    // Find OPF path
    const rootfiles = doc.getElementsByTagName('rootfile');
    if (!rootfiles.length) {
        throw new Error('No rootfile found in container.xml');
    }
    
    for (let i = 0; i < rootfiles.length; i++) {
        const rootfile = rootfiles[i];
        const mediaType = rootfile.getAttribute('media-type');
        if (mediaType === 'application/oebps-package+xml') {
            return rootfile.getAttribute('full-path');
        }
    }
    
    throw new Error('OPF file not found in container.xml');
}

async function readOpf(zip, opfPath) {
    const opfEntry = zip.file(opfPath);
    if (!opfEntry) {
        throw new Error(`OPF file not found at path: ${opfPath}`);
    }
    
    const opfXml = await opfEntry.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfXml, 'application/xml');
    
    return doc;
}

function parseManifest(opfDoc) {
    const items = {};
    const manifestElements = opfDoc.getElementsByTagName('item');
    
    for (let i = 0; i < manifestElements.length; i++) {
        const item = manifestElements[i];
        const id = item.getAttribute('id');
        const href = item.getAttribute('href');
        const mediaType = item.getAttribute('media-type');
        
        items[id] = { id, href, mediaType };
    }
    
    return items;
}

function parseSpine(opfDoc, manifest) {
    const spineItems = [];
    const spineElements = opfDoc.getElementsByTagName('itemref');
    
    for (let i = 0; i < spineElements.length; i++) {
        const itemref = spineElements[i];
        const idref = itemref.getAttribute('idref');
        const linear = itemref.getAttribute('linear') !== 'no';
        
        if (manifest[idref]) {
            spineItems.push({
                id: idref,
                href: manifest[idref].href,
                mediaType: manifest[idref].mediaType,
                index: i,
                linear
            });
        }
    }
    
    return spineItems;
}

async function getChapterHtml(zip, basePath, spineItem) {
    // Calculate full path to chapter file, handling relative paths
    const baseDir = path.dirname(basePath);
    const fullPath = path.normalize(path.join(baseDir, spineItem.href)).replace(/\\/g, '/');
    
    // Get file from zip
    const fileEntry = zip.file(fullPath);
    if (!fileEntry) {
        console.error(`Chapter file not found at path: ${fullPath}`);
        return null;
    }
    
    // Get content
    const content = await fileEntry.async('text');
    
    return content;
}

// The extractOuterHTML function has been removed as getChapterHtml
// already returns the full raw HTML of the chapter. This raw HTML
// is directly compared against the ground truth HTML files.

// --- Enhanced Normalization and Comparison ---
function normalizeHtml(htmlString, caseInsensitive = false) {
    if (!htmlString) return '';
    
    // Basic normalization: trim whitespace, remove extra spaces between tags
    let normalized = htmlString.trim().replace(/>\s+</g, '><');
    
    if (caseInsensitive) {
        // Convert attribute names to lowercase
        normalized = normalized.replace(/(\s+)([a-zA-Z0-9_:-]+)(=["'][^"']*["'])/g, (match, space, attrName, attrValue) => {
            return `${space}${attrName.toLowerCase()}${attrValue}`;
        });
    }

    // Convert ALL empty tags <tag ...></tag> to self-closing <tag .../>
    normalized = normalized.replace(/<([a-zA-Z0-9]+)([^>]*)><\/\1>/g, (match, tagName, attributes) => {
        return `<${tagName}${attributes}/>`;
    });

    return normalized;
}

function semanticCompare(rawJsHtml, groundTruthHtml) {
    // Compares two full HTML strings (raw JS-extracted HTML vs. ground truth HTML)
    // after normalization.
    if (!rawJsHtml || !groundTruthHtml) {
        return {
            isEqual: false,
            diffInfo: 'One or both HTML inputs were null or empty.',
            div1: rawJsHtml?.substring(0, 50) + '...' || 'NULL',
            div2: groundTruthHtml?.substring(0, 50) + '...' || 'NULL'
        };
    }

    // Normalize both sides for comparison
    const normalizedJsHtml = normalizeHtml(rawJsHtml, true);
    const normalizedGroundTruth = normalizeHtml(groundTruthHtml, true);

    // Remove all whitespace for strict comparison
    const normalizedJsHtmlNoSpace = normalizedJsHtml.replace(/\s+/g, '');
    const normalizedGroundTruthNoSpace = normalizedGroundTruth.replace(/\s+/g, '');

    const isEqual = normalizedJsHtmlNoSpace === normalizedGroundTruthNoSpace;

    // If not equal, find the difference
    let diffInfo = '';
    if (!isEqual) {
        let pos = 0;
        const minLength = Math.min(normalizedJsHtmlNoSpace.length, normalizedGroundTruthNoSpace.length);
        while (pos < minLength && normalizedJsHtmlNoSpace[pos] === normalizedGroundTruthNoSpace[pos]) {
            pos++;
        }
        const start = Math.max(0, pos - 100);
        const end1 = Math.min(pos + 100, normalizedJsHtmlNoSpace.length);
        const end2 = Math.min(pos + 100, normalizedGroundTruthNoSpace.length);

        diffInfo = `Difference at position ${pos} (normalized, no whitespace):
`;
        diffInfo += `JS (${start}-${end1}): ${normalizedJsHtmlNoSpace.substring(start, end1)}
`;
        diffInfo += `GT (${start}-${end2}): ${normalizedGroundTruthNoSpace.substring(start, end2)}`;
    }

    return {
        isEqual,
        div1: rawJsHtml?.substring(0, 200) + (rawJsHtml?.length > 200 ? '...' : ''),
        div2: groundTruthHtml?.substring(0, 200) + (groundTruthHtml?.length > 200 ? '...' : ''),
        diffInfo
    };
}

// Add a function to write a detailed diff comparison for a chapter
async function saveDetailedDiffForChapter(index, rawJsHtml, groundTruthHtml) {
    const tempDir = getTempDir();

    // Normalize both sides (case-insensitive attributes)
    const normalizedJsHtml = normalizeHtml(rawJsHtml, true);
    const normalizedGroundTruth = normalizeHtml(groundTruthHtml, true);

    // Save raw files for reference
    const rawJsPath = path.join(tempDir, `chapter_${index}_js_raw.html`);
    await fs.writeFile(rawJsPath, rawJsHtml);
    const rawGtPath = path.join(tempDir, `chapter_${index}_gt_raw.html`);
    await fs.writeFile(rawGtPath, groundTruthHtml);

    // Save normalized versions for reference
    const normalizedJsPath = path.join(tempDir, `chapter_${index}_js_normalized.html`);
    await fs.writeFile(normalizedJsPath, normalizedJsHtml);
    const normalizedGtPath = path.join(tempDir, `chapter_${index}_gt_normalized.html`);
    await fs.writeFile(normalizedGtPath, normalizedGroundTruth);

    console.log(`\nDETAILED COMPARISON FILES FOR CHAPTER ${index}:`);
    console.log(`Raw JS HTML saved to: ${rawJsPath}`);
    console.log(`Raw Ground Truth HTML saved to: ${rawGtPath}`);
    console.log(`Normalized JS HTML saved to: ${normalizedJsPath}`);
    console.log(`Normalized Ground Truth HTML saved to: ${normalizedGtPath}`);

    // Find the first difference between normalized strings without whitespace
    const normalizedJsHtmlNoSpace = normalizedJsHtml.replace(/\s+/g, '');
    const normalizedGroundTruthNoSpace = normalizedGroundTruth.replace(/\s+/g, '');

    let pos = 0;
    const minLength = Math.min(normalizedJsHtmlNoSpace.length, normalizedGroundTruthNoSpace.length);

    while (pos < minLength && normalizedJsHtmlNoSpace[pos] === normalizedGroundTruthNoSpace[pos]) pos++;

    if (pos < minLength || normalizedJsHtmlNoSpace.length !== normalizedGroundTruthNoSpace.length) {
        console.log(`\nFirst difference found at position ${pos} (comparing normalized, whitespace-removed strings).`);
        const start = Math.max(0, pos - 20);
        const endJ = Math.min(normalizedJsHtmlNoSpace.length, pos + 100);
        const endG = Math.min(normalizedGroundTruthNoSpace.length, pos + 100);

        console.log(`Context (JS, pos ${start}-${endJ}): ${normalizedJsHtmlNoSpace.substring(start, endJ)}`);
        console.log(`Context (GT, pos ${start}-${endG}): ${normalizedGroundTruthNoSpace.substring(start, endG)}`);

        // Save whitespace-removed versions for binary diff
        const noSpaceJsPath = path.join(tempDir, `chapter_${index}_js_normalized_nospace.txt`);
        await fs.writeFile(noSpaceJsPath, normalizedJsHtmlNoSpace);
        const noSpaceGtPath = path.join(tempDir, `chapter_${index}_gt_normalized_nospace.txt`);
        await fs.writeFile(noSpaceGtPath, normalizedGroundTruthNoSpace);
        console.log(`
Whitespace-removed normalized versions saved for detailed diffing:`);
        console.log(`- ${noSpaceJsPath}`);
        console.log(`- ${noSpaceGtPath}`);
    } else {
        console.log(`\nCONTENT APPEARS IDENTICAL AFTER NORMALIZATION and whitespace removal.`);
    }

    return tempDir;
}

// --- Main Test Function ---
async function main() {
    // Default EPUB file path (relative to the script's parent directory, i.e., project root)
    const defaultEpubPath = path.join(__dirname, '../DCC1.epub');
    const epubFilePath = process.argv[2] || defaultEpubPath;
    
    // Ground truth directory (now relative to the script location using __dirname)
    const groundTruthDir = path.join(__dirname, 'ground_truth_data');
    const groundTruthManifestFile = 'DCC1_chapters_manifest.json'; // Assuming this name

    console.log(`Testing EPUB: ${epubFilePath}`);

    // Read the manifest
    let manifestData;
    try {
        const manifestPath = path.join(groundTruthDir, groundTruthManifestFile);
        const manifestJson = await fs.readFile(manifestPath, 'utf-8');
        manifestData = JSON.parse(manifestJson);
        console.log(`Read manifest: ${groundTruthManifestFile}`);
    } catch (error) {
        console.error(`Failed to read or parse manifest file ${groundTruthManifestFile}:`, error);
        return;
    }

    // Read the EPUB file
    let epubBuffer;
    try {
        epubBuffer = await fs.readFile(epubFilePath);
        console.log(`Read EPUB file: ${epubFilePath}`);
    } catch (error) {
        console.error(`Failed to read EPUB file ${epubFilePath}:`, error);
        return;
    }

    // Unzip and parse the EPUB structure
    try {
        console.log("Parsing EPUB structure...");
        const zip = await JSZip.loadAsync(epubBuffer);
        
        // Get OPF path
        const opfPath = await readContainerXml(zip);
        console.log(`Found OPF file at: ${opfPath}`);
        
        // Parse OPF
        const opfDoc = await readOpf(zip, opfPath);
        
        // Parse manifest and spine
        const manifest = parseManifest(opfDoc);
        const spine = parseSpine(opfDoc, manifest);
        
        console.log(`Found ${spine.length} spine items`);
        
        // Map spine indices to our tests
        const spineMapping = {};
        for (const spineItem of spine) {
            spineMapping[spineItem.index] = spineItem;
        }
        
        // 4. Iterate and Compare Chapters
        let successCount = 0;
        let failCount = 0;

        if (!manifestData || !Array.isArray(manifestData)) {
            console.error("Manifest data is not in the expected format (array).");
            return;
        }

        const totalChaptersInManifest = manifestData.length;
        console.log(`Chapters in Manifest: ${totalChaptersInManifest}, Chapters found in EPUB: ${spine.length}`);

        for (const chapterInfo of manifestData) {
            const index = chapterInfo.spine_index;
            const groundTruthFilename = path.basename(chapterInfo.output_file);
            const groundTruthPath = path.join(groundTruthDir, groundTruthFilename);

            console.log(`\n--- Testing Chapter ${index} (${groundTruthFilename}) ---`);

            let jsHtml = null;
            let gtHtml = null;

            try {
                // Get ground truth HTML
                try {
                    gtHtml = await fs.readFile(groundTruthPath, 'utf-8');
                } catch (readError) {
                    console.error(`Failed to read ground truth file: ${groundTruthPath} - ${readError.message}`);
                    failCount++;
                    continue; 
                }
                
                // Get EPUB HTML (this is the raw full HTML content from the EPUB file)
                const spineItem = spineMapping[index];
                if (!spineItem) {
                    console.error(`Spine item not found for index: ${index} in EPUB spine mapping.`);
                    failCount++;
                    continue;
                }
                
                const rawHtmlFromJs = await getChapterHtml(zip, opfPath, spineItem);
                if (!rawHtmlFromJs) {
                    console.error(`Failed to get chapter HTML for index: ${index} from EPUB.`);
                    failCount++;
                    continue;
                }
                
                // If this is the chapter we want detailed diff for
                if (index === detailedChapterIndex) {
                    const tempDir = await saveDetailedDiffForChapter(index, rawHtmlFromJs, gtHtml);
                    console.log(`
Temporary files for detailed diff saved to: ${tempDir}`);
                    console.log('Please examine these files for differences, then delete the directory when done.');
                    // Only process this one chapter if we're in detailed mode
                    return;
                }
                
                // Use semantic comparison comparing raw JS HTML and ground truth HTML
                const semanticResult = semanticCompare(rawHtmlFromJs, gtHtml);
                
                if (semanticResult.isEqual) {
                    console.log(`✅ Chapter ${index} (${groundTruthFilename}): PASSED (semantic comparison of full HTML)`);
                    successCount++;
                } else {
                    console.error(`Chapter ${index}: FAILED - HTML semantic mismatch.`);
                    
                    // More detailed logging
                    if (semanticResult.div1) {
                        console.error(`   JS (raw) Start: ${semanticResult.div1}`);
                    }
                    
                    if (semanticResult.div2) {
                        console.error(`   GT (raw) Start: ${semanticResult.div2}`);
                    }
                    
                    if (semanticResult.diffInfo) {
                        console.error(`   Diff Details: ${semanticResult.diffInfo}`);
                    }
                    
                    failCount++;
                }
            } catch (processorError) {
                console.error(`Failed to process chapter ${index}:`, processorError);
                failCount++;
            }
        }
        
        console.log(`\nTest completed. Successes: ${successCount}, Failures: ${failCount}`);
    } catch (error) {
        console.error("An error occurred during the test:", error);
    }
}

// --- Entry Point ---
const epubFile = process.argv[2] || 'DCC1.epub';
const groundTruthFolder = process.argv[3] || 'ground_truth_data';
const manifestFile = process.argv[4] || 'DCC1_chapters_manifest.json';
const detailedChapter = process.argv[5] ? parseInt(process.argv[5], 10) : -1; // Optional chapter index for detailed diff

if (isNaN(detailedChapter)) {
    console.error("Invalid chapter index provided for detailed diff. Must be a number.");
} else {
    main()
        .catch(err => console.error("Test runner encountered an error:", err));
}

module.exports = { main };
