import { ready as dbReady } from './dbService.js';
import { getAllBooksMetadata, deleteBook } from './dbService.js';
import { renderBookshelf } from './bookshelfUI.js';

const logPrefix = '[DemoInit]';

// We know we're in demo mode if this script is loaded
window.IS_DEMO_MODE = true;
console.log(`${logPrefix} Setting global IS_DEMO_MODE flag to true`);

// Demo book metadata
const DEMO_BOOKS = [
    {
        id: 'demo-uuid-dcc-smol',
        filename: 'dcc_smol.epub',
        title: 'Declaration of the Rights of Man',
        coverImage: '/static/demo_books/covers/dcc_cover.jpg',
        description: 'French Revolution document establishing basic rights'
    },
    {
        id: 'demo-uuid-wasteland-smol',
        filename: 'wasteland_smol.epub',
        title: 'The Waste Land',
        coverImage: '/static/demo_books/covers/wasteland_cover.jpg',
        description: 'T.S. Eliot\'s modernist poem'
    },
    {
        id: 'demo-uuid-kusamakura-smol',
        filename: '草枕_smol.epub',
        title: 'Kusamakura (草枕)',
        coverImage: '/static/demo_books/covers/kusamakura_cover.jpg',
        description: 'Natsume Soseki\'s Japanese novel'
    }
];

// Add CSS styles for demo books
function addDemoBookStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .book-item.demo-book {
            position: relative;
            border: 2px solid #4CAF50;
            box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
        }
        .book-item.demo-book::after {
            content: "DEMO";
            position: absolute;
            top: 5px;
            right: 5px;
            background-color: #4CAF50;
            color: white;
            padding: 2px 5px;
            border-radius: 3px;
            font-size: 0.7em;
            font-weight: bold;
        }
        .demo-badge {
            position: absolute;
            top: 0;
            right: 0;
            background-color: #4CAF50;
            color: white;
            padding: 2px 5px;
            border-radius: 3px;
            font-size: 0.7em;
            font-weight: bold;
        }
    `;
    document.head.appendChild(styleEl);
}

// Function to mark non-demo books as locked
function lockNonDemoBooks() {
    const bookItems = document.querySelectorAll('.book-item:not(.demo-book)');
    bookItems.forEach(bookItem => {
        bookItem.classList.add('locked-book');
    });
}

// Add CSS styles for locked books
function addLockedBookStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .book-item.locked-book {
            position: relative;
            opacity: 0.5;
        }
        .book-item.locked-book::after {
            content: "DEMO ONLY";
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-weight: bold;
            pointer-events: none;
        }
    `;
    document.head.appendChild(styleEl);
}

// Set up a MutationObserver to watch for bookshelf changes
function setupBookshelfObserver() {
    const recentBooksGrid = document.getElementById('recent-books-grid');
    if (!recentBooksGrid) {
        console.warn(`${logPrefix} Cannot find recent-books-grid to observe.`);
        return;
    }

    // Create an observer instance
    const observer = new MutationObserver((mutations) => {
        // If we observe changes to the grid, check and lock non-demo books
        lockNonDemoBooks();
    });

    // Configuration of the observer:
    const config = { childList: true, subtree: true };

    // Start observing
    observer.observe(recentBooksGrid, config);
    console.log(`${logPrefix} Bookshelf observer setup complete.`);
}

/**
 * Creates a book item DOM element for a demo book
 */
function createDemoBookElement(book) {
    // Create the main book item container
    const bookItemDiv = document.createElement('div');
    bookItemDiv.className = 'book-item demo-book';
    bookItemDiv.dataset.bookId = book.id;
    bookItemDiv.setAttribute('role', 'listitem');

    // Create cover container to maintain consistent sizing
    const coverContainer = document.createElement('div');
    coverContainer.className = 'demo-cover-container';
    coverContainer.style.position = 'relative';
    coverContainer.style.height = '180px';
    coverContainer.style.overflow = 'hidden';
    coverContainer.style.backgroundColor = '#f8f8f8';
    coverContainer.style.display = 'flex';
    coverContainer.style.justifyContent = 'center';
    coverContainer.style.alignItems = 'center';

    // Create and add cover image if available
    if (book.coverImage) {
        const img = document.createElement('img');
        img.className = 'demo-cover-image';
        img.src = book.coverImage;
        img.alt = `Cover for ${book.title}`;
        img.style.maxHeight = '100%';
        img.style.maxWidth = '100%';
        img.style.objectFit = 'cover';
        
        // Handle loading error gracefully
        img.onerror = () => {
            console.warn(`${logPrefix} Failed to load cover image for ${book.title}, using fallback`);
            img.style.display = 'none';
            
            // Create fallback text cover
            const fallbackCover = document.createElement('div');
            fallbackCover.textContent = book.title.substring(0, 1).toUpperCase();
            fallbackCover.style.fontSize = '48px';
            fallbackCover.style.color = '#666';
            fallbackCover.style.fontWeight = 'bold';
            coverContainer.appendChild(fallbackCover);
        };
        
        coverContainer.appendChild(img);
    } else {
        // If no cover image specified, use the first letter as a placeholder
        const textCover = document.createElement('div');
        textCover.textContent = book.title.substring(0, 1).toUpperCase();
        textCover.style.fontSize = '48px';
        textCover.style.color = '#666';
        textCover.style.fontWeight = 'bold';
        coverContainer.appendChild(textCover);
    }
    
    // Add the DEMO badge
    const badgeDiv = document.createElement('div');
    badgeDiv.className = 'demo-badge';
    badgeDiv.textContent = 'DEMO';
    badgeDiv.style.position = 'absolute';
    badgeDiv.style.top = '5px';
    badgeDiv.style.right = '5px';
    badgeDiv.style.backgroundColor = '#4CAF50';
    badgeDiv.style.color = 'white';
    badgeDiv.style.padding = '3px 6px';
    badgeDiv.style.borderRadius = '3px';
    badgeDiv.style.fontSize = '0.7rem';
    badgeDiv.style.fontWeight = 'bold';
    badgeDiv.style.zIndex = '2';
    coverContainer.appendChild(badgeDiv);
    
    bookItemDiv.appendChild(coverContainer);

    // Create title link
    const bookLink = document.createElement('a');
    bookLink.href = `/read/${book.id}/0`;
    bookLink.textContent = book.title;
    bookLink.style.fontWeight = 'bold'; 
    bookLink.style.textDecoration = 'none';
    bookLink.style.color = '#333';
    bookLink.style.display = 'block';
    bookLink.style.padding = '8px 0 2px 0';
    bookLink.title = book.description || '';
    bookItemDiv.appendChild(bookLink);

    // Add description as small text
    if (book.description) {
        const descDiv = document.createElement('div');
        descDiv.className = 'book-description';
        descDiv.textContent = book.description;
        descDiv.style.fontSize = '0.8em';
        descDiv.style.color = '#666';
        descDiv.style.marginTop = '2px';
        descDiv.style.height = '2.4em';
        descDiv.style.overflow = 'hidden';
        descDiv.style.textOverflow = 'ellipsis';
        bookItemDiv.appendChild(descDiv);
    }

    return bookItemDiv;
}

/**
 * Adds demo books directly to the bookshelf DOM
 */
async function addDemoBooksToDOM() {
    const recentBooksGrid = document.getElementById('recent-books-grid');
    if (!recentBooksGrid) {
        console.error(`${logPrefix} Cannot find bookshelf grid element.`);
        return;
    }

    // Clear "empty bookshelf" message if present
    if (recentBooksGrid.innerHTML.includes('Your bookshelf is empty')) {
        recentBooksGrid.innerHTML = '';
    }

    // Add each demo book to the bookshelf
    DEMO_BOOKS.forEach(book => {
        console.log(`${logPrefix} Adding demo book to DOM: ${book.title}`);
        const bookElement = createDemoBookElement(book);
        recentBooksGrid.appendChild(bookElement);
    });

    console.log(`${logPrefix} All demo books added to DOM.`);
}

/**
 * Deletes any demo books that might have been saved to IndexedDB
 * from previous versions of the app
 */
async function cleanupOldDemoBooks() {
    console.log(`${logPrefix} Checking for old demo books in IndexedDB to clean up...`);
    
    try {
        // Get all books from IndexedDB
        const allBooks = await getAllBooksMetadata();
        
        // Find books that look like demo books
        const demoBooksToDelete = allBooks.filter(book => 
            // Identify by known demo IDs
            DEMO_BOOKS.some(demoBook => demoBook.id === book.id) ||
            // Or by the isDemo flag that was previously used
            book.isDemo === true ||
            // Or by ID patterns like "demo-" prefix
            (book.id && book.id.toString().includes('demo-'))
        );
        
        if (demoBooksToDelete.length > 0) {
            console.log(`${logPrefix} Found ${demoBooksToDelete.length} old demo book(s) to clean up:`, 
                demoBooksToDelete.map(b => b.title || b.id));
                
            // Delete them one by one
            for (const book of demoBooksToDelete) {
                await deleteBook(book.id);
                console.log(`${logPrefix} Deleted old demo book: ${book.title || book.id}`);
            }
            
            console.log(`${logPrefix} Successfully cleaned up all old demo books from IndexedDB.`);
        } else {
            console.log(`${logPrefix} No old demo books found in IndexedDB.`);
        }
    } catch (error) {
        console.error(`${logPrefix} Error cleaning up old demo books:`, error);
    }
}

// Start the demo loading process
async function initDemo() {
    // Add the CSS styles
    addDemoBookStyles();
    addLockedBookStyles();
    
    // Set up the MutationObserver to watch for bookshelf changes
    setupBookshelfObserver();

    console.log(`${logPrefix} Starting demo initialization...`);
    
    // Wait for the initial bookshelf render
    await dbReady;
    
    // Clean up any old demo books from previous versions of the app
    await cleanupOldDemoBooks();
    
    // First, let the regular bookshelf render (it will show user's books)
    // Then we add our demo books directly to the DOM
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Add demo books to the DOM
    await addDemoBooksToDOM();
    
    // Lock any non-demo books
    lockNonDemoBooks();
    
    console.log(`${logPrefix} Demo initialization complete.`);
}

// Start the initialization
initDemo(); 