/**
 * background.js - Service Worker for CourseWeb Fav Navigator
 * 
 * This file runs as a background service worker (Manifest V3).
 * It handles:
 * - Extension installation and setup
 * - Communication between content script and popup
 * - Storage management for saved sections
 * - Message passing between different extension components
 * - Periodic checking for new PDF links and notifications
 */

// Interval ID for the periodic check (10 minutes = 600000 milliseconds)
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
let checkIntervalId = null;

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('CourseWeb Fav Navigator installed:', details.reason);
  
  // Initialize storage if needed
  chrome.storage.local.set({
    pdfLinks: [],
    lastScraped: null
  });
  
  // Start periodic checking for new PDFs
  startPeriodicPdfCheck();
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  // Handle PDF links storage from content script
  if (request.action === 'storePdfLinks') {
    chrome.storage.local.set({
      pdfLinks: request.pdfLinks,
      lastScraped: new Date().toISOString()
    }, () => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
  
  // Handle request to get stored PDF links
  if (request.action === 'getPdfLinks') {
    chrome.storage.local.get(['pdfLinks', 'lastScraped'], (result) => {
      sendResponse({
        pdfLinks: result.pdfLinks || [],
        lastScraped: result.lastScraped || null
      });
    });
    return true; // Keep channel open for async response
  }
  
  // Handle search results storage
  if (request.action === 'storeSearchResults') {
    chrome.storage.local.set({
      searchResults: request.results,
      searchQuery: request.query
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  // Handle request to get search results
  if (request.action === 'getSearchResults') {
    chrome.storage.local.get(['searchResults', 'searchQuery'], (result) => {
      sendResponse({
        results: result.searchResults || [],
        query: result.searchQuery || null
      });
    });
    return true;
  }
  
  // Handle PDF fetching request to bypass CORS
  if (request.action === 'FETCH_PDF') {
    // Fetch the PDF file and return as ArrayBuffer
    fetch(request.pdfUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        sendResponse({ success: true, arrayBuffer: arrayBuffer });
      })
      .catch(error => {
        console.error('Error fetching PDF:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});

/**
 * Checks for new PDF links by querying CourseWeb tabs and comparing with stored links
 */
async function checkForNewPdfLinks() {
  try {
    // Get stored PDF links from previous check
    const storedData = await new Promise((resolve) => {
      chrome.storage.local.get(['pdfLinks'], (result) => {
        resolve(result);
      });
    });
    
    const storedPdfUrls = storedData.pdfLinks || [];
    
    // Find all CourseWeb tabs (both www and non-www)
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ 
        url: ['https://www.courseweb.sliit.lk/*', 'https://courseweb.sliit.lk/*'] 
      }, (tabs) => {
        resolve(tabs);
      });
    });
    
    if (tabs.length === 0) {
      console.log('No CourseWeb tabs found for PDF check');
      return;
    }
    
    // Get PDF links from the first CourseWeb tab
    const firstTab = tabs[0];
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(firstTab.id, { action: 'GET_PDF_LINKS' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
    
    if (!response || !response.success || !response.pdfUrls) {
      console.log('Failed to get PDF links from content script');
      return;
    }
    
    const currentPdfUrls = response.pdfUrls || [];
    
    // Compare current PDFs with stored PDFs
    const newPdfUrls = currentPdfUrls.filter(url => !storedPdfUrls.includes(url));
    
    if (newPdfUrls.length > 0) {
      console.log(`Found ${newPdfUrls.length} new PDF link(s)`);
      
      // Update stored PDF links
      chrome.storage.local.set({
        pdfLinks: currentPdfUrls,
        lastScraped: new Date().toISOString()
      });
      
      // Send notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('logo.png'),
        title: 'CourseWeb Fav Navigator',
        message: 'New Unofficial Result Uploaded',
        priority: 2
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error('Error creating notification:', chrome.runtime.lastError);
        } else {
          console.log('Notification created:', notificationId);
        }
      });
    } else {
      console.log('No new PDF links found');
    }
  } catch (error) {
    console.error('Error checking for new PDF links:', error);
  }
}

/**
 * Starts the periodic check for new PDF links
 * Checks every 10 minutes
 */
function startPeriodicPdfCheck() {
  // Clear any existing interval
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }
  
  // Perform initial check after 1 minute (to allow extension to settle)
  setTimeout(() => {
    checkForNewPdfLinks();
  }, 60 * 1000);
  
  // Set up periodic check every 10 minutes
  checkIntervalId = setInterval(() => {
    checkForNewPdfLinks();
  }, CHECK_INTERVAL_MS);
  
  console.log('Periodic PDF check started (every 10 minutes)');
}

/**
 * Stops the periodic check for new PDF links
 */
function stopPeriodicPdfCheck() {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
    console.log('Periodic PDF check stopped');
  }
}

// Listen for tab updates to trigger content script actions if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // When a CourseWeb page finishes loading, we can trigger scraping
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('courseweb.sliit.lk')) {
    console.log('CourseWeb page loaded:', tab.url);
    
    
    // Content script will handle the scraping automatically
  }
});

// Start periodic check when service worker starts
startPeriodicPdfCheck();
