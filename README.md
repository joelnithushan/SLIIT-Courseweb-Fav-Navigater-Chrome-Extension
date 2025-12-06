# CourseWeb Result Finder - Chrome Extension

A Chrome Extension (Manifest V3) that scrapes PDF links from CourseWeb unofficial results pages and allows searching for student IT numbers within those PDFs.

## Project Structure

```
CourseWebExtention/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for background tasks
├── content.js            # Content script that runs on CourseWeb pages
├── popup/
│   ├── popup.html        # Popup UI HTML
│   ├── popup.js          # Popup logic and PDF search functionality
│   └── popup.css         # Popup styling
└── lib/
    ├── pdf.js            # PDF.js library (needs to be downloaded)
    └── pdf.worker.js     # PDF.js worker (needs to be downloaded)
```

## Setup Instructions

### 1. Download PDF.js Library

The extension requires PDF.js to search within PDF files. You need to download and add the library files:

1. Visit https://mozilla.github.io/pdf.js/getting_started/#download
2. Download the latest stable version (recommended: v3.x or v4.x)
3. Extract the downloaded package
4. Copy the following files to the `lib/` directory:
   - `build/pdf.js` → `lib/pdf.js`
   - `build/pdf.worker.js` → `lib/pdf.worker.js`

### 2. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `CourseWebExtention` folder
5. The extension should now be installed

## Features

- **PDF Link Scraping**: Automatically detects and scrapes all PDF links from CourseWeb unofficial results pages
- **Manual Scraping**: Use the "Scrape PDF Links" button in the popup to manually trigger scraping
- **Student Search**: Enter a student IT number to search across all scraped PDF files
- **Results Display**: Shows which PDFs contain the searched student IT number

## How It Works

1. **Content Script (content.js)**: 
   - Runs on `https://www.courseweb.sliit.lk/*` pages
   - Automatically detects unofficial results pages
   - Scrapes all PDF links from the page
   - Sends scraped data to the background script

2. **Background Script (background.js)**:
   - Manages storage of PDF links and search results
   - Handles communication between content script and popup
   - Stores data in Chrome's local storage

3. **Popup (popup.html/js/css)**:
   - Provides UI for scraping PDF links
   - Allows entering student IT numbers
   - Uses PDF.js to search within PDF files
   - Displays search results

## Usage

1. Navigate to a CourseWeb unofficial results page (`https://www.courseweb.sliit.lk/*`)
2. Click the extension icon to open the popup
3. Click "Scrape PDF Links" to find all PDFs on the current page
4. Enter a student IT number (e.g., "IT123456") in the search field
5. Click "Search" to find which PDFs contain that student ID
6. Click on any result link to open the PDF in a new tab

## Permissions

- `activeTab`: To interact with the current CourseWeb tab
- `storage`: To store PDF links and search results
- `https://www.courseweb.sliit.lk/*`: To run content scripts on CourseWeb pages

## Notes

- The extension only works on CourseWeb pages (`https://www.courseweb.sliit.lk/*`)
- PDF searching may be limited by CORS policies if PDFs are hosted on different domains
- The extension stores data locally in Chrome's storage
- PDF.js is required for searching within PDF files

## Development

All files include detailed comments explaining their purpose and functionality. The code is structured to be easily maintainable and extensible.

