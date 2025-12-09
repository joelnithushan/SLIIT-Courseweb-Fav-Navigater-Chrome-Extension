/**
 * compare.js - Snapshot Comparison Utility
 * 
 * This utility provides functions to compare snapshots of CourseWeb pages
 * to detect new content updates.
 */

/**
 * Compares two snapshot arrays and returns true if there are differences
 * @param {Array} oldSnapshot - Previous snapshot array
 * @param {Array} newSnapshot - Current snapshot array
 * @returns {boolean} True if snapshots differ (new content detected)
 */
function compareSnapshots(oldSnapshot, newSnapshot) {
  // Handle null/undefined cases
  if (!oldSnapshot || !Array.isArray(oldSnapshot) || oldSnapshot.length === 0) {
    // If old snapshot is empty, any new items count as changes
    return newSnapshot && Array.isArray(newSnapshot) && newSnapshot.length > 0;
  }
  
  if (!newSnapshot || !Array.isArray(newSnapshot) || newSnapshot.length === 0) {
    return false; // No new items, no changes
  }
  
  // Create sets of unique identifiers (URLs are primary, fallback to name)
  const oldIds = new Set();
  oldSnapshot.forEach(item => {
    const id = getItemId(item);
    if (id) {
      oldIds.add(id.toLowerCase().trim());
    }
  });
  
  const newIds = new Set();
  newSnapshot.forEach(item => {
    const id = getItemId(item);
    if (id) {
      newIds.add(id.toLowerCase().trim());
    }
  });
  
  // If lengths differ, there's definitely a change
  if (oldIds.size !== newIds.size) {
    return true;
  }
  
  // Check if any new items exist (items in new but not in old)
  for (const newId of newIds) {
    if (!oldIds.has(newId)) {
      return true; // New item found
    }
  }
  
  return false; // No differences found
}

/**
 * Normalizes an item for comparison (handles strings and objects)
 * @param {string|Object} item - Item to normalize
 * @returns {string} Normalized string representation
 */
function normalizeItem(item) {
  if (typeof item === 'string') {
    return item.trim().toLowerCase();
  }
  
  if (typeof item === 'object' && item !== null) {
    // If it's an object with a name/url/text property, use that
    if (item.name) return item.name.trim().toLowerCase();
    if (item.url) return item.url.trim().toLowerCase();
    if (item.text) return item.text.trim().toLowerCase();
    if (item.title) return item.title.trim().toLowerCase();
    
    // Otherwise, stringify and normalize
    return JSON.stringify(item).trim().toLowerCase();
  }
  
  return String(item).trim().toLowerCase();
}

/**
 * Extracts a unique identifier from a snapshot item
 * Used for creating stable snapshots
 * @param {string|Object} item - Snapshot item
 * @returns {string} Unique identifier
 */
function getItemId(item) {
  if (typeof item === 'string') {
    // If it's a string, check if it looks like a URL
    const trimmed = item.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return trimmed;
  }
  
  if (typeof item === 'object' && item !== null) {
    // ALWAYS prefer URL as unique identifier (most reliable)
    if (item.url) {
      return item.url.trim();
    }
    // For items without URL, use name as identifier
    if (item.name) {
      return item.name.trim();
    }
    if (item.id) {
      return String(item.id).trim();
    }
    if (item.text) {
      return item.text.trim();
    }
    
    // Fallback: create a stable identifier from the object
    // Use type + name/url if available
    const parts = [];
    if (item.type) parts.push(item.type);
    if (item.name) parts.push(item.name);
    if (item.url) parts.push(item.url);
    if (parts.length > 0) {
      return parts.join('|');
    }
    
    // Last resort: stringified version (not ideal but better than nothing)
    return JSON.stringify(item);
  }
  
  return String(item).trim();
}

/**
 * Creates a stable snapshot by removing duplicates and sorting
 * @param {Array} snapshot - Raw snapshot array
 * @returns {Array} Deduplicated and sorted snapshot
 */
function createStableSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) {
    return [];
  }
  
  // Create a map to deduplicate by ID
  const itemMap = new Map();
  
  snapshot.forEach(item => {
    const id = getItemId(item);
    if (id && !itemMap.has(id)) {
      itemMap.set(id, item);
    }
  });
  
  // Convert back to array and sort
  const uniqueItems = Array.from(itemMap.values());
  
  // Sort by ID for consistency
  uniqueItems.sort((a, b) => {
    const idA = getItemId(a);
    const idB = getItemId(b);
    return idA.localeCompare(idB);
  });
  
  return uniqueItems;
}

// Export functions for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    compareSnapshots,
    normalizeItem,
    getItemId,
    createStableSnapshot
  };
}


