# Flask EPUB Reader

A simple web application built with Flask and ebooklib to upload and read EPUB files directly in your browser.

## Features

- **EPUB Upload**: Upload `.epub` files via a web form.
- **In-Memory Processing**: EPUB files are processed in memory using temporary files, avoiding permanent server storage.
- **Web-Based Reading**: Displays EPUB content chapter by chapter in the browser.
- **Table of Contents**: Extracts the ToC and provides a collapsible side drawer for navigation.
- **Chapter Navigation**: "Previous" and "Next" buttons allow sequential reading.
- **Session-Based**: Stores book structure (spine, ToC) and current state in the user's session.

## Getting Started

### Prerequisites

- Python 3.x
- pip (Python package installer)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd ProgressiveReader
    ```

2.  **Create and activate a virtual environment (recommended):**
    ```bash
    # Windows
    python -m venv venv
    .\venv\Scripts\activate

    # macOS/Linux
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Run the Flask application:**
    ```bash
    python app.py
    ```

5.  Open your web browser and navigate to `http://127.0.0.1:5000` (or the address provided by Flask).

## Usage

1.  Visit the home page (`/`).
2.  Use the "Choose File" button to select an `.epub` file from your computer.
3.  Click "Upload EPUB".
4.  The first chapter/section of the book will be displayed.
5.  Use the "Previous" and "Next" buttons at the top or bottom to navigate through sections.
6.  Click the hamburger icon (☰) in the top-left corner to open the Table of Contents drawer.
7.  Click on a title in the drawer to jump to that section.
8.  Click "Back to Upload" or the close button ('×') in the drawer to return to the upload page (this will clear the current book session).

## Technologies Used

- **Backend**: Flask (Python web framework)
- **EPUB Parsing**: ebooklib (Python library)
- **Frontend**: HTML, CSS, JavaScript (within Flask templates)

## License

MIT

## Acknowledgements

- [EPUB.js](https://github.com/futurepress/epub.js/) for the EPUB parsing and rendering capabilities