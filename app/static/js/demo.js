/* ──────────────────────────────────────────────────────────────
 * demo.js  – lightweight "ephemeral demo" loader
 * ────────────────────────────────────────────────────────────── */

import { ready as dbReady }               from './dbService.js';
import { getLocalBooksMetadata, deleteBook } from './dbService.js';
import { EpubProcessorWrapper }           from './epubProcessor.js';

const logPrefix = '[DemoInit]';

/*--------------------------------------------------------------
 | 0.  Global demo flag                                        
 *--------------------------------------------------------------*/
window.IS_DEMO_MODE = true;
console.log(`${logPrefix} Setting global IS_DEMO_MODE flag to true`);

/*--------------------------------------------------------------
 | 1.  Demo-book descriptors                                   
 *--------------------------------------------------------------*/
const DEMO_BOOKS = [
  {
    id:        'demo-uuid-dcc-smol',
    filename:  'dcc_smol.epub',
    title:     'Dungeon Crawler Carl – 01',
    coverImage:'/static/demo_books/covers/dcc_cover.jpg', // fallback
  },
  {
    id:        'demo-uuid-wasteland-smol',
    filename:  'wasteland_smol.epub',
    title:     'The Waste Land',
    coverImage:'/static/demo_books/covers/wasteland_cover.jpg',
  },
  {
    id:        'demo-uuid-kusamakura-smol',
    filename:  '草枕_smol.epub',
    title:     'Kusamakura (草枕)',
    coverImage:'/static/demo_books/covers/kusamakura_cover.jpg',
  },
];

/*--------------------------------------------------------------
 | 1a.  Preload JSZip & epub.js once so loadBook never stalls  
 *--------------------------------------------------------------*/
async function preloadEpubDependencies() {
  const jszipUrl  = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const epubjsUrl = 'https://unpkg.com/epubjs@0.3.93/dist/epub.min.js';

  if (!window.JSZip) {
    console.log(`${logPrefix} Loading JSZip…`);
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src   = jszipUrl;
      s.async = true;
      s.onload  = () => resolve();
      s.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(s);
    });
  }

  if (!window.ePub) {
    console.log(`${logPrefix} Loading epub.js…`);
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src   = epubjsUrl;
      s.async = true;
      s.onload  = () => resolve();
      s.onerror = () => reject(new Error('Failed to load epub.js'));
      document.head.appendChild(s);
    });
  }

  console.log(`${logPrefix} EPUB dependencies are ready`);  // from internal loader logic :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}:contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
}

/*--------------------------------------------------------------
 | 2.  Cover extraction (purely in-memory)                      
 *--------------------------------------------------------------*/
async function attachCoverImage(book) {
  try {
    const res = await fetch(`/static/demo_books/${book.filename}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const buf  = await res.arrayBuffer();
    const proc = new EpubProcessorWrapper();
    await proc.loadBook(buf);             // guaranteed not to stall
    const coverBlob = await proc.getCoverBlob();
    if (coverBlob) book.coverImage = URL.createObjectURL(coverBlob);
  } catch (err) {
    console.warn(`${logPrefix} cover extraction failed for ${book.title}:`, err);
  }
}

/*--------------------------------------------------------------
 | 3.  Visual styling                                           
 *--------------------------------------------------------------*/
function addDemoBookStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .book-item.demo-book {
      position: relative;
      border: 2px solid #4CAF50;
      box-shadow: 0 0 8px rgba(76,175,80,.5);
    }
    .book-item.demo-book::after {
      content: "DEMO";
      position: absolute;
      top: 5px; right: 5px;
      background: #4CAF50; color: #fff;
      padding: 2px 6px; border-radius: 3px;
      font-size: .7em; font-weight: 700;
    }
    .book-item.locked-book {
      position: relative; opacity: .5;
    }
    .book-item.locked-book::after {
      content: "DEMO ONLY";
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%,-50%) rotate(-30deg);
      background: rgba(0,0,0,.7); color: #fff;
      padding: 5px 12px; border-radius: 4px;
      font-weight: 700; pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

/*--------------------------------------------------------------
 | 4.  DOM helpers                                              
 *--------------------------------------------------------------*/
function createDemoBookElement(book) {
  const item = document.createElement('div');
  item.className   = 'book-item demo-book';
  item.dataset.bookId = book.id;

  // cover container
  const coverBox = document.createElement('div');
  coverBox.style.cssText = `
    position:relative;height:180px;overflow:hidden;
    background:#f8f8f8;display:flex;justify-content:center;align-items:center;
  `;
  if (book.coverImage) {
    const img = document.createElement('img');
    img.src   = book.coverImage;
    img.alt   = `Cover for ${book.title}`;
    img.style.cssText = 'max-height:100%;max-width:100%;object-fit:cover';
    img.onerror = () => { img.remove(); addLetterFallback(); };
    coverBox.appendChild(img);
  } else {
    addLetterFallback();
  }
  function addLetterFallback() {
    const div = document.createElement('div');
    div.textContent = book.title[0].toUpperCase();
    div.style.cssText = 'font: bold 48px/1 sans-serif;color:#666';
    coverBox.appendChild(div);
  }
  item.appendChild(coverBox);

  // book title (not a link itself anymore)
  const titleElement = document.createElement('p'); // Using <p> for consistency
  titleElement.textContent = book.title;
  titleElement.style.cssText = `
    display:block;padding:8px 0 2px 0;
    font-weight:700;color:#333;text-decoration:none;
  `; // Retain styling but it's not an <a>
  item.appendChild(titleElement);

  // Create the main link that wraps the item
  const linkWrapper = document.createElement('a');
  linkWrapper.href = `/demo/read/${book.id}/0`;
  linkWrapper.className = 'book-item-link'; // For consistency and potential styling
  linkWrapper.setAttribute('aria-label', `Read ${book.title || 'Untitled Demo Book'}`);
  linkWrapper.style.textDecoration = 'none'; // Ensure no underline for the wrapper
  linkWrapper.style.color = 'inherit'; // Inherit color to avoid default link blue on everything

  linkWrapper.appendChild(item);

  return linkWrapper; // Return the link that now wraps the item
}

/*--------------------------------------------------------------
 | 5.  Insert demo books                                        
 *--------------------------------------------------------------*/
async function addDemoBooksToDOM() {
  const grid = document.getElementById('recent-books-grid');
  if (!grid) return console.error(`${logPrefix} bookshelf grid not found`);

  if (grid.innerHTML.includes('Your bookshelf is empty')) {
    grid.innerHTML = '';
  }

  DEMO_BOOKS.forEach(book => {
    console.log(`${logPrefix} Injecting demo book: ${book.title}`);
    grid.appendChild(createDemoBookElement(book));
  });
}

function lockNonDemoBooks() {
  document
    .querySelectorAll('.book-item:not(.demo-book)')
    .forEach(el => el.classList.add('locked-book'));
}

/*--------------------------------------------------------------
 | 6.  Observe bookshelf mutations                             
 *--------------------------------------------------------------*/
function setupBookshelfObserver() {
  const grid = document.getElementById('recent-books-grid');
  if (!grid) return console.warn(`${logPrefix} cannot observe grid`);

  new MutationObserver(lockNonDemoBooks)
    .observe(grid, { childList:true, subtree:true });

  console.log(`${logPrefix} Bookshelf observer active`);
}

/*--------------------------------------------------------------
 | 7.  Clean up old persistent demo blobs                       
 *--------------------------------------------------------------*/
async function cleanupOldDemoBooks() {
  console.log(`${logPrefix} Cleaning legacy demo blobs…`);
  try {
    const all = await getLocalBooksMetadata();
    const toDel = all.filter(rec =>
      DEMO_BOOKS.some(d => d.id === rec.id) ||
      rec.isDemo === true ||
      String(rec.id).startsWith('demo-')
    );
    for (const rec of toDel) {
      await deleteBook(rec.id, rec.driveId, driveSync);
      console.log(`${logPrefix} Removed legacy demo blob: ${rec.title||rec.id}`);
    }
  } catch (err) {
    console.error(`${logPrefix} cleanup failed:`, err);
  }
}

/*--------------------------------------------------------------
 | 8.  Initialise demo mode                                     
 *--------------------------------------------------------------*/
async function initDemo() {
  const demoButton = document.getElementById('to-demo-page-link');
  if (demoButton) {
    demoButton.style.display = 'none';
    console.log(`${logPrefix} "To Demo Page" link hidden as we are already in demo mode.`);
  }

  addDemoBookStyles();
  setupBookshelfObserver();

  console.log(`${logPrefix} Waiting for bookshelf render…`);
  await dbReady;                    
  await cleanupOldDemoBooks();

  // preload the ZIP + EPUB libraries so attachCoverImage never stalls
  await preloadEpubDependencies();

  // tiny pause so the UI settles
  await new Promise(r => setTimeout(r, 500));

  // now extract covers in parallel and inject
  await Promise.all(DEMO_BOOKS.map(attachCoverImage));
  await addDemoBooksToDOM();
  lockNonDemoBooks();

  console.log(`${logPrefix} Demo initialization complete.`);
}

/*--------------------------------------------------------------
 | 9.  Revoke blob-URLs on unload                               
 *--------------------------------------------------------------*/
window.addEventListener('beforeunload', () => {
  DEMO_BOOKS.forEach(b => {
    if (b.coverImage?.startsWith('blob:')) URL.revokeObjectURL(b.coverImage);
  });
});

/*--------------------------------------------------------------*/
initDemo();
