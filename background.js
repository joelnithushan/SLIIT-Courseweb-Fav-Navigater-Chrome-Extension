/**
 * background.js - Service Worker for CourseWeb Fav Navigator
 * 
 * This file runs as a background service worker (Manifest V3).
 * It handles:
 * - Periodic checking for updates in saved sections
 * - Snapshot extraction and comparison
 * - Badge notifications
 * - Storage management
 */

// Import comparison utilities
importScripts('utils/compare.js');

// Configuration
const CHECK_INTERVAL_MINUTES = 5; // Default check interval (user adjustable)
const ALARM_NAME = 'checkSavedSections';

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('CourseWeb Fav Navigator installed:', details.reason);
  
  // Initialize storage
  chrome.storage.local.get(['savedSections', 'checkInterval'], (result) => {
    const savedSections = result.savedSections || [];
    const checkInterval = result.checkInterval || CHECK_INTERVAL_MINUTES;
    
    // Migrate old format if needed
    if (savedSections.length === 0) {
      chrome.storage.local.get(['savedSection'], (oldResult) => {
        if (oldResult.savedSection) {
          const migratedSection = {
            id: generateUUID(),
            name: oldResult.savedSection.name || 'Saved Section',
            url: oldResult.savedSection.url,
            hasNew: false,
            lastSnapshot: [],
            lastChecked: null
          };
          chrome.storage.local.set({
            savedSections: [migratedSection],
            savedSection: null
          });
        }
      });
    }
    
    // Start periodic checking
    startPeriodicCheck(checkInterval);
  });
});

/**
 * Generate UUID for section IDs
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Start periodic checking using alarms API
 */
function startPeriodicCheck(intervalMinutes = CHECK_INTERVAL_MINUTES) {
  // Clear existing alarm
  chrome.alarms.clear(ALARM_NAME);
  
  // Create new alarm
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: intervalMinutes
  });
  
  console.log(`Periodic check started (every ${intervalMinutes} minutes)`);
  
  // Perform initial check after 1 minute
  setTimeout(() => {
    checkAllSavedSections();
  }, 60 * 1000);
}

/**
 * Listen for alarm events
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkAllSavedSections();
  }
});

/**
 * Check all saved sections for updates
 */
async function checkAllSavedSections() {
  try {
    const result = await chrome.storage.local.get(['savedSections']);
    const savedSections = result.savedSections || [];
    
    if (savedSections.length === 0) {
      updateBadge(false);
      return;
    }
    
    console.log(`Checking ${savedSections.length} saved section(s) for updates...`);
    
    // Check each section
    let hasAnyUpdates = false;
    const updatedSections = [];
    
    for (const section of savedSections) {
      try {
        const hasNew = await checkSectionForUpdates(section);
        if (hasNew) {
          hasAnyUpdates = true;
          section.hasNew = true;
        }
        updatedSections.push(section);
      } catch (error) {
        console.error(`Error checking section ${section.name}:`, error);
        // Keep the section as-is if check fails
        updatedSections.push(section);
      }
    }
    
    // Update storage with modified sections
    await chrome.storage.local.set({ savedSections: updatedSections });
    
    // Update badge
    updateBadge(hasAnyUpdates);
    
    console.log('Check complete. Updates found:', hasAnyUpdates);
  } catch (error) {
    console.error('Error checking saved sections:', error);
  }
}

/**
 * Check a single section for updates
 * @param {Object} section - Section object with url, lastSnapshot, etc.
 * @returns {Promise<boolean>} True if updates detected
 */
async function checkSectionForUpdates(section) {
  try {
    console.log(`Checking section: ${section.name} (${section.url})`);
    
    // Fetch the page content
    const response = await fetch(section.url, {
      credentials: 'include', // Include cookies for authentication
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch ${section.url}: ${response.status} ${response.statusText}`);
      return false;
    }
    
    const html = await response.text();
    console.log(`Fetched ${html.length} bytes from ${section.name}`);
    
    // Extract snapshot from HTML
    const newSnapshot = extractSnapshot(html, section.url);
    console.log(`Extracted ${newSnapshot.length} items from ${section.name}`);
    
    // Compare with previous snapshot
    const oldSnapshot = section.lastSnapshot || [];
    console.log(`Previous snapshot had ${oldSnapshot.length} items`);
    
    // If this is the first check (no previous snapshot), establish baseline without marking as "new"
    const isFirstCheck = !oldSnapshot || oldSnapshot.length === 0;
    
    const hasChanges = compareSnapshots(oldSnapshot, newSnapshot);
    
    if (hasChanges) {
      // For first check, just establish baseline without marking as "new"
      if (isFirstCheck) {
        console.log(`First check for ${section.name} - establishing baseline with ${newSnapshot.length} items`);
        section.lastSnapshot = createStableSnapshot(newSnapshot);
        section.lastChecked = new Date().toISOString();
        return false; // Don't mark as "new" on first check
      }
      // Get more details about what changed
      const oldUrls = new Set((oldSnapshot || []).map(item => {
        const url = typeof item === 'string' ? item : (item.url || item.name || '');
        return url.toLowerCase();
      }));
      const newUrls = new Set(newSnapshot.map(item => {
        const url = typeof item === 'string' ? item : (item.url || item.name || '');
        return url.toLowerCase();
      }));
      
      const newItems = newSnapshot.filter(item => {
        const url = typeof item === 'string' ? item : (item.url || item.name || '');
        return !oldUrls.has(url.toLowerCase());
      });
      
      console.log(`✅ Updates detected in ${section.name}: ${newItems.length} new item(s)`);
      if (newItems.length > 0) {
        console.log('New items:', newItems.slice(0, 5).map(i => i.name || i.url || i).join(', '));
      }
      
      // Update last snapshot and check time
      section.lastSnapshot = createStableSnapshot(newSnapshot);
      section.lastChecked = new Date().toISOString();
      return true;
    } else {
      console.log(`No changes detected in ${section.name}`);
      // Update check time even if no changes
      section.lastChecked = new Date().toISOString();
      return false;
    }
  } catch (error) {
    console.error(`Error checking ${section.name}:`, error);
    return false;
  }
}

/**
 * Extract snapshot from HTML content
 * @param {string} html - HTML content
 * @param {string} url - URL of the page
 * @returns {Array} Array of snapshot items
 */
function extractSnapshot(html, url) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Detect page type and extract accordingly
    if (isModulePage(url, doc)) {
      return extractModulePageSnapshot(doc);
    } else if (isResultsPage(url, doc)) {
      return extractResultsPageSnapshot(doc);
    } else {
      // Generic page extraction
      return extractGenericPageSnapshot(doc);
    }
  } catch (error) {
    console.error('Error parsing HTML:', error);
    return [];
  }
}

/**
 * Check if page is a module page
 */
function isModulePage(url, doc) {
  return url.includes('/course/view.php') || 
         url.includes('/mod/') ||
         doc.querySelector('.activityinstance, .modtype_resource, .modtype_folder') !== null;
}

/**
 * Check if page is a results page
 */
function isResultsPage(url, doc) {
  return url.includes('unofficial') || 
         url.includes('result') ||
         /unofficial.*result|result.*page/i.test(doc.title || '') ||
         doc.querySelector('a[href*=".pdf"]') !== null;
}

/**
 * Extract snapshot from module page (lecture PDFs, notices, files)
 */
function extractModulePageSnapshot(doc) {
  const snapshot = [];
  const seen = new Set();
  
  // FIRST: Extract ALL PDF links (most important for detection)
  // This should catch PDFs regardless of their container structure
  const allPdfLinks = doc.querySelectorAll('a[href]');
  allPdfLinks.forEach(link => {
    const href = link.getAttribute('href') || link.href || '';
    const fullUrl = href.startsWith('http') ? href : (new URL(href, doc.baseURI || 'https://www.courseweb.sliit.lk')).href;
    
    // Check if it's a PDF (case-insensitive, check both href and full URL)
    if (href.toLowerCase().includes('.pdf') || fullUrl.toLowerCase().includes('.pdf')) {
      const name = link.textContent.trim() || 
                   link.title.trim() || 
                   link.getAttribute('title') || 
                   link.getAttribute('aria-label') ||
                   fullUrl.split('/').pop() || 
                   'PDF Document';
      const url = fullUrl;
      
      // Use URL as primary key since it's unique
      const key = url.toLowerCase();
      
      if (!seen.has(key) && url) {
        seen.add(key);
        snapshot.push({
          name: name,
          url: url,
          type: 'pdf'
        });
      }
    }
  });
  
  // Extract activity instances (lecture notes, PDFs, folders)
  const activities = doc.querySelectorAll('.activityinstance, .modtype_resource, .modtype_folder, [class*="activity"], [class*="resource"]');
  activities.forEach(activity => {
    const link = activity.querySelector('a');
    if (link) {
      const href = link.getAttribute('href') || link.href || '';
      const fullUrl = href.startsWith('http') ? href : (new URL(href, doc.baseURI || 'https://www.courseweb.sliit.lk')).href;
      const name = link.textContent.trim() || link.title.trim() || link.getAttribute('title') || '';
      const key = fullUrl.toLowerCase();
      
      if (name && !seen.has(key) && fullUrl) {
        seen.add(key);
        snapshot.push({
          name: name,
          url: fullUrl,
          type: 'activity'
        });
      }
    }
  });
  
  // Extract file links (non-PDF files)
  const fileLinks = doc.querySelectorAll('a[href*="file"], a[href*="resource"], a[href*="download"]');
  fileLinks.forEach(link => {
    const href = link.getAttribute('href') || link.href || '';
    const fullUrl = href.startsWith('http') ? href : (new URL(href, doc.baseURI || 'https://www.courseweb.sliit.lk')).href;
    
    // Skip if already captured as PDF
    if (fullUrl.toLowerCase().includes('.pdf')) {
      return;
    }
    
    const name = link.textContent.trim() || link.title.trim() || link.getAttribute('title') || fullUrl.split('/').pop() || '';
    const key = fullUrl.toLowerCase();
    
    if (name && !seen.has(key) && fullUrl) {
      seen.add(key);
      snapshot.push({
        name: name,
        url: fullUrl,
        type: 'file'
      });
    }
  });
  
  // Extract announcements/notices
  const notices = doc.querySelectorAll('.forum-post, .notice, .announcement, [class*="notice"], [class*="forum"]');
  notices.forEach(notice => {
    const title = notice.querySelector('h3, h4, .subject, .title, [class*="title"]')?.textContent.trim();
    if (title && title.length > 3) {
      const key = `notice|${title.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        snapshot.push({
          name: title,
          type: 'notice'
        });
      }
    }
  });
  
  console.log(`Extracted ${snapshot.length} items from module page (${snapshot.filter(s => s.type === 'pdf').length} PDFs)`);
  return snapshot;
}

/**
 * Extract snapshot from results page
 */
function extractResultsPageSnapshot(doc) {
  const snapshot = [];
  const seen = new Set();
  
  // Extract ALL PDF links (results are typically PDFs)
  // Use more comprehensive selector
  const allLinks = doc.querySelectorAll('a[href]');
  allLinks.forEach(link => {
    const href = link.getAttribute('href') || link.href || '';
    const fullUrl = href.startsWith('http') ? href : (new URL(href, doc.baseURI || 'https://www.courseweb.sliit.lk')).href;
    
    // Check if it's a PDF (case-insensitive)
    if (href.toLowerCase().includes('.pdf') || fullUrl.toLowerCase().includes('.pdf')) {
      const name = link.textContent.trim() || 
                   link.title.trim() || 
                   link.getAttribute('title') ||
                   link.getAttribute('aria-label') ||
                   fullUrl.split('/').pop() || 
                   'Result PDF';
      const url = fullUrl;
      
      // Use URL as primary key since it's unique
      const key = url.toLowerCase();
      
      if (!seen.has(key) && url) {
        seen.add(key);
        snapshot.push({
          name: name,
          url: url,
          type: 'result'
        });
      }
    }
  });
  
  // Extract any announcement or notice about results
  const announcements = doc.querySelectorAll('.announcement, .notice, [class*="result"], [class*="message"]');
  announcements.forEach(announcement => {
    const text = announcement.textContent.trim();
    if (text && text.length > 10 && text.length < 200) {
      const key = `announcement|${text.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        snapshot.push({
          name: text,
          type: 'announcement'
        });
      }
    }
  });
  
  console.log(`Extracted ${snapshot.length} items from results page (${snapshot.filter(s => s.type === 'result').length} PDFs)`);
  return snapshot;
}

/**
 * Extract snapshot from generic page (fallback)
 */
function extractGenericPageSnapshot(doc) {
  const snapshot = [];
  const seen = new Set();
  
  // FIRST: Extract ALL PDF links (most important)
  const allLinks = doc.querySelectorAll('a[href]');
  allLinks.forEach(link => {
    const href = link.getAttribute('href') || link.href || '';
    const fullUrl = href.startsWith('http') ? href : (new URL(href, doc.baseURI || 'https://www.courseweb.sliit.lk')).href;
    
    // Check if it's a PDF
    if (href.toLowerCase().includes('.pdf') || fullUrl.toLowerCase().includes('.pdf')) {
      const name = link.textContent.trim() || 
                   link.title.trim() || 
                   link.getAttribute('title') ||
                   fullUrl.split('/').pop() || 
                   'PDF Document';
      const url = fullUrl;
      const key = url.toLowerCase();
      
      if (!seen.has(key) && url) {
        seen.add(key);
        snapshot.push({
          name: name,
          url: url,
          type: 'pdf'
        });
      }
    }
  });
  
  // Extract all meaningful links (non-PDF)
  allLinks.forEach(link => {
    const href = link.getAttribute('href') || link.href || '';
    const fullUrl = href.startsWith('http') ? href : (new URL(href, doc.baseURI || 'https://www.courseweb.sliit.lk')).href;
    
    // Skip PDFs (already captured)
    if (fullUrl.toLowerCase().includes('.pdf')) {
      return;
    }
    
    const name = link.textContent.trim() || link.title.trim() || link.getAttribute('title') || '';
    
    // Skip if it's not meaningful
    if (!name || name.length < 3 || name.length > 200) {
      return;
    }
    
    // Skip common navigation elements
    if (name.match(/^(home|back|next|previous|menu|login|logout)$/i)) {
      return;
    }
    
    const key = fullUrl.toLowerCase();
    if (!seen.has(key) && fullUrl) {
      seen.add(key);
      snapshot.push({
        name: name,
        url: fullUrl,
        type: 'link'
      });
    }
  });
  
  // Extract headings as content indicators
  const headings = doc.querySelectorAll('h1, h2, h3');
  headings.forEach(heading => {
    const text = heading.textContent.trim();
    if (text && text.length > 3 && text.length < 200) {
      const key = `heading|${text.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        snapshot.push({
          name: text,
          type: 'heading'
        });
      }
    }
  });
  
  console.log(`Extracted ${snapshot.length} items from generic page (${snapshot.filter(s => s.type === 'pdf').length} PDFs)`);
  return snapshot;
}

/**
 * Update badge based on whether any sections have updates
 */
async function updateBadge(hasUpdates) {
  try {
    if (hasUpdates) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

/**
 * Listen for messages from popup or content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle manual check request
  if (request.action === 'CHECK_UPDATES_NOW') {
    checkAllSavedSections().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open
  }
  
  // Handle clear notification request
  if (request.action === 'CLEAR_NOTIFICATION') {
    chrome.storage.local.get(['savedSections'], (result) => {
      const savedSections = result.savedSections || [];
      const updatedSections = savedSections.map(section => {
        if (section.id === request.sectionId) {
          section.hasNew = false;
        }
        return section;
      });
      
      chrome.storage.local.set({ savedSections: updatedSections }, () => {
        // Update badge
        const hasAnyUpdates = updatedSections.some(s => s.hasNew);
        updateBadge(hasAnyUpdates);
        sendResponse({ success: true });
      });
    });
    return true;
  }
  
  // Handle update check interval
  if (request.action === 'UPDATE_CHECK_INTERVAL') {
    chrome.storage.local.set({ checkInterval: request.interval }, () => {
      startPeriodicCheck(request.interval);
      sendResponse({ success: true });
    });
    return true;
  }
  
  // Handle badge state update request
  if (request.action === 'UPDATE_BADGE_STATE') {
    updateBadge(request.hasUpdates);
    sendResponse({ success: true });
    return true;
  }
  
  // Legacy handlers for backward compatibility
  if (request.action === 'storePdfLinks') {
    chrome.storage.local.set({
      pdfLinks: request.pdfLinks,
      lastScraped: new Date().toISOString()
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getPdfLinks') {
    chrome.storage.local.get(['pdfLinks', 'lastScraped'], (result) => {
      sendResponse({
        pdfLinks: result.pdfLinks || [],
        lastScraped: result.lastScraped || null
      });
    });
    return true;
  }
  
  if (request.action === 'FETCH_PDF') {
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
    return true;
  }
});

// Initialize badge state when service worker starts
async function initializeBadgeState() {
  try {
    const result = await chrome.storage.local.get(['savedSections']);
    const savedSections = result.savedSections || [];
    const hasAnyUpdates = savedSections.some(s => s.hasNew);
    await updateBadge(hasAnyUpdates);
  } catch (error) {
    console.error('Error initializing badge state:', error);
  }
}

// Start periodic check when service worker starts
chrome.storage.local.get(['checkInterval'], (result) => {
  const interval = result.checkInterval || CHECK_INTERVAL_MINUTES;
  startPeriodicCheck(interval);
  initializeBadgeState();
});
