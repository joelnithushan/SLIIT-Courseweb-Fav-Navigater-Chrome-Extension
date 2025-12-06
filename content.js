/**
 * content.js - Content Script for CourseWeb Fav Navigator
 * 
 * This script runs on https://www.courseweb.sliit.lk/* and https://courseweb.sliit.lk/* pages.
 * It scans the DOM for PDF links and responds to messages from the popup.
 * It handles login detection and section scanning.
 */

// Array to store all found PDF information (URL, name, etc.)
let pdfLinks = [];

/**
 * Checks if the user is logged in by looking for common login indicators
 * @returns {boolean} True if user appears to be logged in
 */
function isUserLoggedIn() {
  // Check for common indicators of being logged in:
  // 1. No login form present
  // 2. User menu or profile elements present
  // 3. Dashboard or course content visible
  
  const loginForm = document.querySelector('form[action*="login"]');
  const userMenu = document.querySelector('[data-userid], .usermenu, .user-menu, #usermenu');
  const dashboardContent = document.querySelector('.dashboard, .course-content, .course-list');
  
  // If login form is present and visible, user is likely not logged in
  if (loginForm && loginForm.offsetParent !== null) {
    return false;
  }
  
  // If user menu or dashboard content is present, user is likely logged in
  if (userMenu || dashboardContent) {
    return true;
  }
  
  // Check URL - if we're on a course page or dashboard, user is logged in
  const currentUrl = window.location.href;
  if (currentUrl.includes('/course/') || 
      currentUrl.includes('/my/') || 
      currentUrl.includes('/dashboard') ||
      currentUrl.includes('/user/')) {
    return true;
  }
  
  // Default: assume logged in if we're past the login page
  return !currentUrl.includes('/login/');
}


/**
 * Scans the DOM for all <a> elements that link to .pdf files
 * and stores their information (URL, name, text) in the pdfLinks array
 */
function scanForPdfLinks() {
  // Clear previous results
  pdfLinks = [];
  const seenUrls = new Set();
  
  // Find all anchor tags with href attributes
  const links = document.querySelectorAll('a[href]');
  
  // Iterate through each link
  links.forEach((link) => {
    const href = link.href;
    
    // Check if the link points to a PDF file
    // Case-insensitive check for .pdf extension
    if (href.toLowerCase().endsWith('.pdf')) {
      // Avoid duplicates
      if (!seenUrls.has(href)) {
        seenUrls.add(href);
        
        // Extract PDF information
        const pdfInfo = {
          url: href,
          name: link.textContent.trim() || link.innerText.trim() || 'PDF',
          title: link.title || link.textContent.trim() || href,
          // Try to get parent element text for more context
          fullText: link.textContent.trim() || link.innerText.trim() || ''
        };
        
        pdfLinks.push(pdfInfo);
        console.log('Found PDF link:', pdfInfo);
      }
    }
  });
  
  console.log(`Total PDF links found: ${pdfLinks.length}`);
  return pdfLinks;
}

/**
 * Initial scan when the page loads
 * This ensures PDF links are available even before the popup requests them
 */
if (document.readyState === 'loading') {
  // Page is still loading, wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    scanForPdfLinks();
  });
} else {
  // Page is already loaded, scan immediately
  scanForPdfLinks();
}

/**
 * Scans the page for available sections (courses, years, unofficial results, etc.)
 * Returns all course-related sections that could contain results
 * @returns {Array<Object>} Array of section objects with name and URL
 */
function getAvailableSections() {
  const sections = [];
  const seenUrls = new Set();
  
  // Look for section links - these are typically in cards, course links, or navigation
  // Include sections that contain keywords like "year", "unofficial", "result", "course", etc.
  const links = document.querySelectorAll('a[href]');
  
  links.forEach((link) => {
    const text = link.textContent.trim();
    const href = link.href;
    
    // Skip if we've already seen this URL
    if (seenUrls.has(href)) {
      return;
    }
    
    // Check if it's a course-related link
    // Look for course view URLs or links that contain relevant keywords
    const isCourseLink = href.includes('/course/view.php') || 
                        href.includes('/course/') ||
                        /year|unofficial|result|course|semester|module/i.test(text);
    
    // Must be a valid section link
    if (isCourseLink && 
        text.length > 0 && 
        text.length < 150 && // Reasonable length
        !href.includes('#') && // Skip anchor links
        !href.endsWith('.pdf') && // Skip direct PDF links
        !href.includes('logout') && // Skip logout links
        !href.includes('login')) { // Skip login links
      
      seenUrls.add(href);
      sections.push({
        name: text || 'Unnamed Section',
        url: href
      });
    }
  });
  
  // Sort sections intelligently
  sections.sort((a, b) => {
    // Extract year numbers for sorting
    const yearA = a.name.match(/year\s+(\d+)/i);
    const yearB = b.name.match(/year\s+(\d+)/i);
    
    if (yearA && yearB) {
      return parseInt(yearA[1]) - parseInt(yearB[1]);
    }
    // If both have year but different format, sort alphabetically
    if (yearA) return -1;
    if (yearB) return 1;
    
    // Prioritize "unofficial result" sections
    const unofficialA = /unofficial.*result/i.test(a.name);
    const unofficialB = /unofficial.*result/i.test(b.name);
    if (unofficialA && !unofficialB) return -1;
    if (!unofficialA && unofficialB) return 1;
    
    return a.name.localeCompare(b.name);
  });
  
  return sections;
}

/**
 * Filters PDF links based on the current page section
 * If a section is selected, only returns PDFs from that section's page
 * @param {string} sectionUrl - Optional section URL to filter by
 * @returns {Array<Object>} Filtered array of PDF link objects
 */
function getPdfLinksForSection(sectionUrl = null) {
  // If no section specified, return all PDFs
  if (!sectionUrl) {
    return pdfLinks;
  }
  
  // Filter PDFs that belong to the selected section
  // PDFs from a section typically have URLs containing the section's course ID or path
  return pdfLinks.filter(pdf => {
    // Extract course ID from section URL if present
    const sectionMatch = sectionUrl.match(/[?&]id=(\d+)/);
    if (sectionMatch) {
      const courseId = sectionMatch[1];
      // Check if PDF URL contains the course ID or is from the same domain path
      return pdf.url.includes(courseId) || pdf.url.includes(sectionUrl.split('/').slice(0, -1).join('/'));
    }
    return true;
  });
}

/**
 * Listen for messages from popup.js
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Check login status
  if (request.action === 'CHECK_LOGIN') {
    const isLoggedIn = isUserLoggedIn();
    sendResponse({ isLoggedIn: isLoggedIn });
    return true;
  }
  
  // Check if the message is requesting PDF links
  if (request.action === 'GET_PDF_LINKS') {
    // Re-scan to ensure we have the latest PDF links
    scanForPdfLinks();
    
    // Filter by section if specified
    const filteredPdfs = request.sectionUrl 
      ? getPdfLinksForSection(request.sectionUrl)
      : pdfLinks;
    
    // Respond with the array of PDF link objects (with URL and name)
    sendResponse({
      success: true,
      pdfLinks: filteredPdfs,
      pdfUrls: filteredPdfs.map(pdf => pdf.url), // Keep for backward compatibility
      count: filteredPdfs.length
    });
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
  
  // Check if the message is requesting available sections
  if (request.action === 'GET_SECTIONS') {
    const sections = getAvailableSections();
    sendResponse({
      success: true,
      sections: sections,
      currentUrl: window.location.href
    });
    return true;
  }
  
  // Handle request to update saved sections
  if (request.action === 'UPDATE_SAVED_SECTIONS') {
    sendResponse({ success: true });
    return true;
  }
  
  // Legacy support for UPDATE_SAVED_SECTION (backward compatibility)
  if (request.action === 'UPDATE_SAVED_SECTION') {
    sendResponse({ success: true });
    return true;
  }
});
