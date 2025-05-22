# Progressive Reader

A web-based progressive reader for language learning with JPDB integration.

## New TypeScript JP Highlighter

The application now includes an enhanced JP Highlighter module that provides improved Japanese word highlighting with JPDB integration.

### Setting Up the TypeScript Module

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Build the TypeScript module:
   ```bash
   npm run build
   ```

3. For development with automatic rebuilding:
   ```bash
   npm run dev
   ```

### Features

- Highlights Japanese words based on their JPDB status (known, learning, new, etc.)
- Interactive word information on hover
- Mining capabilities directly to JPDB
- Review functionality
- Custom CSS for word and popup styling

## Original Features

- EPUB reader with simple navigation
- Translation capabilities
- JLPT word highlighting (now enhanced with TypeScript)
- Settings management
- And more...

## Features

- **File Upload**: Upload `.epub`, `.pdf`, `.mobi`, `.docx`, or `.txt` files via a web form.
- **In-Memory Processing**: EPUB files are processed in memory using temporary files, avoiding permanent server storage.
- **Web-Based Reading**: Displays EPUB content chapter by chapter in the browser.
- **Table of Contents**: Extracts the ToC and provides a collapsible side drawer for navigation.
- **Chapter Navigation**: "Previous" and "Next" buttons allow sequential reading.
- **Session-Based**: Stores book structure (spine, ToC) and current state in the user's session.
- **Custom Covers**: Use the camera icon on a book card to upload a cover image.
- **Drive Sync Covers**: When connected to Google Drive, cover images are uploaded along with the book file.
- **PDF Parsing**: Extracts page count and estimated font size when uploading PDF files.
- **Google Drive Sync**: Optionally syncs your library to Google Drive while preserving each book's original file type.

## Client Metadata Flow

1. Google Cloud Run indexer extracts metadata from Drive files and stores it in Redis.
2. The web client calls `/metadata/{user}/books` and merges results with IndexedDB via `metadataSync.js`.
3. IndexedDB remains the offline source of truth while Redis provides cross-device updates when online.
4. The bookshelf UI reads from IndexedDB to render books.

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

4.  **Set up Environment Variables:**
    This application uses a `.env` file for managing local environment variables. A template file `.env.template` is provided in the root of the repository.

    *   Copy `.env.template` to a new file named `.env` in the project root:
        ```bash
        # On Windows (Command Prompt or PowerShell)
        copy .env.template .env

        # On macOS/Linux
        cp .env.template .env
        ```
    *   Open the newly created `.env` file in a text editor.
    *   Modify the placeholder values, especially `REDIS_URL`, to match your local setup or cloud services. For example, if you have a Google Cloud Redis instance, set `REDIS_URL` to its connection string (e.g., `redis://<your-redis-ip>:<port>/0`).
    *   The `.env` file is included in `.gitignore` and should **not** be committed to version control.

5.  **Install development dependencies (optional):**
    ```bash
    pip install -r requirements-dev.txt
    ```

6.  **Run the Flask application:**
    ```bash
    python run.py
    ```
    Alternatively, you can use `flask run` if you have the `FLASK_APP` environment
    variable set to `run.py`.

7.  Open your web browser and navigate to `http://127.0.0.1:5000` (or the address provided by Flask).

## Usage

1.  Visit the home page (`/`).
2.  Use the "Choose File" button to select an `.epub`, `.pdf`, `.mobi`, `.docx`, or `.txt` file from your computer.
3.  Click "Upload File".
4.  The first chapter/section of the book will be displayed.
5.  Use the "Previous" and "Next" buttons at the top or bottom to navigate through sections.
6.  Click the hamburger icon (☰) in the top-left corner to open the Table of Contents drawer.
7.  Click on a title in the drawer to jump to that section.
8.  Click "Back to Upload" or the close button ('×') in the drawer to return to the upload page (this will clear the current book session).

## Running Tests

Run the Python test suite using:

```bash
python -m unittest discover -s tests
```

JavaScript unit tests are run with Jest:

```bash
npm test
```


## Technologies Used

- **Backend**: Flask (Python web framework)
- **EPUB Parsing**: ebooklib (Python library)
- **Frontend**: HTML, CSS, JavaScript (within Flask templates)

## License

MIT

## Acknowledgements

- [EPUB.js](https://github.com/futurepress/epub.js/) for the EPUB parsing and rendering capabilities

## Deployment to Google Cloud Run

This application is configured for deployment to Google Cloud Run.

### Prerequisites

- Google Cloud SDK (`gcloud`) installed and configured.
- A Google Cloud Project with billing enabled.
- Cloud Build API and Cloud Run API enabled in your GCP project.

### Deployment Steps

1.  **Authenticate with GCP:**
    ```bash
    gcloud auth login
    gcloud config set project YOUR_PROJECT_ID
    ```
    (Replace `YOUR_PROJECT_ID` with your actual GCP project ID)

2.  **Build and Deploy:**
    Run the following command from the project root directory:
    ```bash
    gcloud run deploy progressive-reader --source . --region YOUR_REGION --allow-unauthenticated
    ```
    - Replace `YOUR_REGION` with your preferred GCP region (e.g., `us-central1`).
    - The `--allow-unauthenticated` flag makes the service publicly accessible. Remove it if you want to manage access via IAM.
    - This command uses Cloud Build to build the container image based on the `Dockerfile` and then deploys it to Cloud Run.

3.  **Set Environment Variables (Secrets):**
    - For the `FLASK_SECRET_KEY`, generate a strong random key.
    - For the `OPENAI_API_KEY`, use your actual key.
    - **Method 1 (gcloud command - recommended for secrets):**
        First, enable the Secret Manager API in your GCP project.
        ```bash
        # Create secrets (do this once)
        printf "your_strong_flask_secret" | gcloud secrets create flask-secret --data-file=-
        printf "your_openai_api_key" | gcloud secrets create openai-secret --data-file=-

        # Deploy or Update service linking secrets
        gcloud run deploy progressive-reader --source . --region YOUR_REGION --allow-unauthenticated \
          --update-secrets=FLASK_SECRET_KEY=flask-secret:latest \
          --update-secrets=OPENAI_API_KEY=openai-secret:latest
        ```
    - **Method 2 (gcloud command - simpler for non-sensitive vars):**
        ```bash
        gcloud run deploy progressive-reader --source . --region YOUR_REGION --allow-unauthenticated \
          --set-env-vars FLASK_SECRET_KEY="your_strong_flask_secret" \
          --set-env-vars OPENAI_API_KEY="your_openai_api_key"
        ```
    - Replace placeholders with your actual keys/secrets.

4.  After deployment, `gcloud` will output the URL of your deployed service.

### Deploy Scripts

For convenience, two shell scripts are provided in the `scripts` directory:

```bash
./scripts/deploy-prod.sh  # Deploys to the production service
./scripts/deploy-test.sh  # Deploys to the test service
```

Both scripts deploy using the `us-central1` region and assume your `gcloud`
configuration is already authenticated and set to the correct project.
## Custom Domain

To use `dev.progressivereader.net` with this Cloud Run service:

1. Create the domain mapping:
   ```bash
   gcloud run domain-mappings create \
     --service=progressive-reader \
     --region YOUR_REGION \
     --domain dev.progressivereader.net
   ```
   You can also perform this step in the Cloud Console under **Custom Domains**.

2. Update your DNS records as instructed. Typically this involves adding a CNAME
   pointing to `ghs.googlehosted.com`.

3. Once DNS changes propagate, Cloud Run automatically provisions an HTTPS
   certificate and the custom domain will be active.
