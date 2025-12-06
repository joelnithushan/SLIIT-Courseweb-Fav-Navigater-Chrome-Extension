/**
 * popup.js - Popup Script for CourseWeb Fav Navigator
 * 
 * This script handles:
 * - Login status checking
 * - Section selection and saving
 * - Manual navigation to saved sections
 */

// Get DOM elements
const statusMessage = document.getElementById('statusMessage');
const sectionContainer = document.getElementById('sectionContainer');
const sectionSearchSelect = document.getElementById('sectionSearchSelect');
const sectionDropdown = document.getElementById('sectionDropdown');
const searchResultsCount = document.getElementById('searchResultsCount');
const saveSectionBtn = document.getElementById('saveSectionBtn');
const savedSectionsContainer = document.getElementById('savedSectionsContainer');

// Store all sections for filtering
let allSections = [];
let selectedSection = null; // Currently selected section

/**
 * Checks if the current tab is a CourseWeb page
 * @returns {Promise<boolean>} True if on CourseWeb page
 */
async function isCourseWebPage() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        resolve(false);
        return;
      }
      const url = tabs[0].url || '';
      resolve(url.includes('courseweb.sliit.lk'));
    });
  });
}

/**
 * Injects content script if not already present
 * @param {number} tabId - Tab ID to inject into
 */
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
  } catch (error) {
    // Content script might already be injected, or injection failed
    console.log('Content script injection:', error.message);
  }
}

/**
 * Checks if user is logged in by querying content script
 * @returns {Promise<boolean>} True if logged in
 */
async function checkLoginStatus() {
  return new Promise(async (resolve) => {
    const isCourseWeb = await isCourseWebPage();
    if (!isCourseWeb) {
      resolve(false);
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (chrome.runtime.lastError || tabs.length === 0) {
        resolve(false);
        return;
      }

      await ensureContentScript(tabs[0].id);
      await new Promise(resolve => setTimeout(resolve, 200));

      chrome.tabs.sendMessage(tabs[0].id, { action: 'CHECK_LOGIN' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(false);
          return;
        }
        resolve(response.isLoggedIn || false);
      });
    });
  });
}

/**
 * Gets available sections from the current page
 * @returns {Promise<Array<Object>>} Array of section objects
 */
async function getAvailableSections() {
  return new Promise(async (resolve) => {
    const isCourseWeb = await isCourseWebPage();
    if (!isCourseWeb) {
      resolve([]);
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (chrome.runtime.lastError || tabs.length === 0) {
        resolve([]);
        return;
      }

      await ensureContentScript(tabs[0].id);
      await new Promise(resolve => setTimeout(resolve, 200));

      chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_SECTIONS' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          resolve([]);
          return;
        }
        resolve(response.sections || []);
      });
    });
  });
}

/**
 * Filters and displays sections in the dropdown
 * @param {string} query - Search query string
 */
function filterAndDisplaySections(query) {
  const searchTerm = query.toLowerCase().trim();
  
  // Filter sections based on search query
  const filteredSections = searchTerm === '' 
    ? allSections 
    : allSections.filter(section => 
        section.name.toLowerCase().includes(searchTerm) ||
        section.url.toLowerCase().includes(searchTerm)
      );
  
  // Update search results count
  if (searchResultsCount) {
    if (searchTerm === '') {
      searchResultsCount.textContent = allSections.length > 0 ? `${allSections.length} sections` : '';
    } else {
      searchResultsCount.textContent = `${filteredSections.length} result${filteredSections.length !== 1 ? 's' : ''}`;
    }
  }
  
  // Clear dropdown
  sectionDropdown.innerHTML = '';
  
  // Show/hide dropdown
  if (filteredSections.length === 0 && searchTerm !== '') {
    const noResultsItem = document.createElement('div');
    noResultsItem.className = 'dropdown-item no-results';
    noResultsItem.textContent = 'No sections found';
    sectionDropdown.appendChild(noResultsItem);
    sectionDropdown.style.display = 'block';
  } else if (filteredSections.length > 0) {
    // Limit to 10 items for better UX
    const displaySections = filteredSections.slice(0, 10);
    
    displaySections.forEach((section) => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.textContent = section.name;
      item.dataset.url = section.url;
      item.dataset.name = section.name;
      
      // Highlight search term
      if (searchTerm) {
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        item.innerHTML = section.name.replace(regex, '<mark>$1</mark>');
      }
      
      // Add click handler
      item.addEventListener('click', () => {
        selectSection(section);
      });
      
      sectionDropdown.appendChild(item);
    });
    
    if (filteredSections.length > 10) {
      const moreItem = document.createElement('div');
      moreItem.className = 'dropdown-item more-results';
      moreItem.textContent = `... and ${filteredSections.length - 10} more. Type to narrow down.`;
      sectionDropdown.appendChild(moreItem);
    }
    
    sectionDropdown.style.display = 'block';
  } else {
    sectionDropdown.style.display = 'none';
  }
}

/**
 * Selects a section
 * @param {Object} section - Section object with url and name
 */
function selectSection(section) {
  selectedSection = section;
  sectionSearchSelect.value = section.name;
  sectionDropdown.style.display = 'none';
  
  // Update input styling to show selection
  sectionSearchSelect.classList.add('has-selection');
}

/**
 * Loads available sections into the dropdown
 * @returns {Promise<void>} Promise that resolves when sections are loaded
 */
async function loadSections() {
  const sections = await getAvailableSections();
  
  // Store all sections for filtering
  allSections = sections;
  
  // Clear search input when loading new sections
  if (sectionSearchSelect) {
    sectionSearchSelect.value = '';
    sectionSearchSelect.classList.remove('has-selection');
    selectedSection = null;
  }
  
  // Filter sections (show all initially)
  filterSections('');
}

/**
 * Shows status message
 * @param {string} message - Message to display
 * @param {string} type - Type of message: 'info', 'error', 'success'
 */
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.style.display = message ? 'block' : 'none';
}


/**
 * Navigates to a saved section
 * @param {string} sectionUrl - URL of the section to navigate to
 */
function navigateToSavedSection(sectionUrl) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { url: sectionUrl });
      // Close popup after navigation
      window.close();
    }
  });
}

/**
 * Removes a saved section
 * @param {string} sectionUrl - URL of the section to remove
 */
function removeSavedSection(sectionUrl) {
  chrome.storage.local.get(['savedSections'], (result) => {
    const savedSections = result.savedSections || [];
    
    // Remove the section from array
    const updatedSections = savedSections.filter(section => section.url !== sectionUrl);
    
    chrome.storage.local.set({ savedSections: updatedSections }, () => {
      showStatus('Section removed successfully!', 'success');
      loadSavedSections();
      loadSavedSectionIntoSelect();
      
      // Notify content script about updated sections
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].url && tabs[0].url.includes('courseweb.sliit.lk')) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'UPDATE_SAVED_SECTIONS',
            sections: updatedSections
          });
        }
      });
    });
  });
}

/**
 * Loads saved sections from storage and displays them
 */
function loadSavedSections() {
  chrome.storage.local.get(['savedSections'], (result) => {
    const savedSections = result.savedSections || [];
    
    if (savedSections.length === 0) {
      savedSectionsContainer.innerHTML = '';
      savedSectionsContainer.style.display = 'none';
      return;
    }
    
    savedSectionsContainer.innerHTML = '<strong>Saved Sections:</strong>';
    savedSectionsContainer.style.display = 'block';
    
    savedSections.forEach((section, index) => {
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'saved-section-item';
      
      sectionDiv.innerHTML = `
        <div class="saved-section-content">
          <div class="saved-section-name" data-url="${section.url}">${section.name}</div>
          <div class="saved-section-actions">
            <button class="remove-section-btn" data-url="${section.url}" title="Remove section">×</button>
          </div>
        </div>
      `;
      
      // Add click to navigate
      const nameDiv = sectionDiv.querySelector('.saved-section-name');
      nameDiv.style.cursor = 'pointer';
      nameDiv.addEventListener('click', () => navigateToSavedSection(section.url));
      
      // Add remove button click
      const removeBtn = sectionDiv.querySelector('.remove-section-btn');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeSavedSection(section.url);
      });
      
      savedSectionsContainer.appendChild(sectionDiv);
    });
  });
}

/**
 * Loads saved sections - marks them in the dropdown if needed
 * This is called after sections are loaded
 */
function loadSavedSectionIntoSelect() {
  // This function is kept for compatibility but not needed for searchable dropdown
  // Saved sections are already included in allSections
}

/**
 * Saves selected section to storage
 */
function saveSection() {
  if (!selectedSection || !selectedSection.url) {
    showStatus('Please search and select a section first', 'error');
    return;
  }
  
  const sectionData = {
    url: selectedSection.url,
    name: selectedSection.name
  };
  
  chrome.storage.local.get(['savedSections'], (result) => {
    const savedSections = result.savedSections || [];
    
    // Check if section already exists
    const exists = savedSections.some(section => section.url === selectedSection.url);
    if (exists) {
      showStatus('This section is already saved!', 'error');
      return;
    }
    
    // Add new section to array
    savedSections.push(sectionData);
    
    chrome.storage.local.set({ savedSections: savedSections }, () => {
      showStatus('Section saved successfully!', 'success');
      loadSavedSections();
      
      // Notify content script about saved sections
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].url && tabs[0].url.includes('courseweb.sliit.lk')) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'UPDATE_SAVED_SECTIONS',
            sections: savedSections
          });
        }
      });
    });
  });
}

/**
 * Updates UI based on login status
 */
async function updateUI() {
  const isCourseWeb = await isCourseWebPage();
  
  if (!isCourseWeb) {
    showStatus('Please navigate to a CourseWeb page', 'info');
    sectionContainer.style.display = 'none';
    return;
  }
  
  // Check login status
  const isLoggedIn = await checkLoginStatus();
  
  if (!isLoggedIn) {
    showStatus('Please login using your CourseWeb credentials', 'error');
    sectionContainer.style.display = 'none';
    return;
  }
  
  // User is logged in
  showStatus('You are logged in', 'success');
  sectionContainer.style.display = 'block';
  
  // Load saved sections info first (for display)
  loadSavedSections();
  
  // Then load sections (which will also mark saved sections in dropdown)
  loadSections();
}

// Event listeners
saveSectionBtn.addEventListener('click', saveSection);

// Searchable select event listeners
if (sectionSearchSelect) {
  // Show dropdown on focus
  sectionSearchSelect.addEventListener('focus', () => {
    if (allSections.length > 0) {
      filterAndDisplaySections(sectionSearchSelect.value);
    }
  });
  
  // Filter as user types
  sectionSearchSelect.addEventListener('input', (e) => {
    selectedSection = null;
    sectionSearchSelect.classList.remove('has-selection');
    filterAndDisplaySections(e.target.value);
  });
  
  // Handle keyboard navigation
  sectionSearchSelect.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      sectionSearchSelect.value = '';
      selectedSection = null;
      sectionSearchSelect.classList.remove('has-selection');
      sectionDropdown.style.display = 'none';
      if (searchResultsCount) {
        searchResultsCount.textContent = allSections.length > 0 ? `${allSections.length} sections` : '';
      }
    } else if (e.key === 'Enter' && selectedSection) {
      e.preventDefault();
      saveSection();
    }
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (sectionSearchSelect && sectionDropdown && 
        !sectionSearchSelect.contains(e.target) && 
        !sectionDropdown.contains(e.target)) {
      sectionDropdown.style.display = 'none';
    }
  });
}

/**
 * Migrates old savedSection to new savedSections array format
 */
function migrateOldSavedSection() {
  chrome.storage.local.get(['savedSection', 'savedSections'], (result) => {
    // If we have old format but no new format, migrate it
    if (result.savedSection && (!result.savedSections || result.savedSections.length === 0)) {
      chrome.storage.local.set({
        savedSections: [result.savedSection],
        savedSection: null // Clear old format
      }, () => {
        console.log('Migrated old savedSection to savedSections array');
        loadSavedSections();
      });
    } else {
      loadSavedSections();
    }
  });
}

// Load state when popup opens
document.addEventListener('DOMContentLoaded', () => {
  // Migrate old format if needed, then load saved sections
  migrateOldSavedSection();
  
  // Then update UI
  updateUI();
});

// Update UI when tab changes
chrome.tabs.onUpdated.addListener(() => {
  if (document.readyState === 'complete') {
    updateUI();
  }
});
