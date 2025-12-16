// Gallery Export Tool - Main Script
// Host this file on GitHub as: gallery-script.js

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================
const CONFIG = {
  // Your Shopify store URL (without https://)
  shopUrl: 'dropscandies.com',
  
  // Your Storefront API Access Token
  storefrontAccessToken: 'f8f837e6b0397c06f037a0aef2aa1037',
  
  // Metaobject type (should match what you created)
  metaobjectType: 'gallery_item'
};

// ============================================
// MAIN APPLICATION
// ============================================
(async function() {
  'use strict';

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    // DOM Elements
    const galleryContainer = document.getElementById('gallery-container');
    const selectAllBtn = document.getElementById('select-all');
    const deselectAllBtn = document.getElementById('deselect-all');
    const exportBtn = document.getElementById('export-pdf');
    const selectionCount = document.getElementById('selection-count');
    const loadingOverlay = document.getElementById('pdf-loading');

    let galleryItems = [];
    let checkboxes = [];

    try {
      // Fetch gallery items from Shopify
      galleryItems = await fetchGalleryItems();
      
      if (galleryItems.length === 0) {
        showEmptyState();
        return;
      }

      // Render the gallery
      renderGallery(galleryItems);
      
      // Setup event listeners
      setupEventListeners();
      
    } catch (error) {
      console.error('Error initializing gallery:', error);
      showErrorState(error.message);
    }

    // Fetch gallery items using Shopify Storefront API
    async function fetchGalleryItems() {
      // Step 1: Get metaobjects with file GIDs
      const metaObjectsQuery = `
        query GetGalleryItems {
          metaobjects(type: "${CONFIG.metaobjectType}", first: 250) {
            edges {
              node {
                id
                fields {
                  key
                  value
                }
              }
            }
          }
        }
      `;

      const metaResponse = await fetch(`https://${CONFIG.shopUrl}/api/unstable/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': CONFIG.storefrontAccessToken
        },
        body: JSON.stringify({ query: metaObjectsQuery })
      });

      if (!metaResponse.ok) {
        throw new Error(`Failed to fetch gallery items: ${metaResponse.statusText}`);
      }

      const metaData = await metaResponse.json();
      
      if (metaData.errors) {
        throw new Error(`GraphQL Error: ${metaData.errors[0].message}`);
      }

      // Step 2: Extract file GIDs and build items
      const items = [];
      const fileGids = [];

      metaData.data.metaobjects.edges.forEach(edge => {
        const fields = edge.node.fields;
        const item = { id: edge.node.id };
        
        fields.forEach(field => {
          if (field.key === 'description') {
            item.description = field.value;
          } else if (field.key === 'display_order') {
            item.displayOrder = parseInt(field.value) || 0;
          } else if (field.key === 'image' && field.value && field.value.startsWith('gid://shopify/MediaImage/')) {
            item.fileGid = field.value;
            fileGids.push(field.value);
          }
        });
        
        if (item.fileGid && item.description) {
          items.push(item);
        }
      });

      // Step 3: Fetch file URLs for all GIDs
      if (fileGids.length > 0) {
        const filesQuery = `
          query GetFiles {
            nodes(ids: [${fileGids.map(gid => `"${gid}"`).join(', ')}]) {
              ... on MediaImage {
                id
                image {
                  url
                }
              }
            }
          }
        `;

        const filesResponse = await fetch(`https://${CONFIG.shopUrl}/api/unstable/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': CONFIG.storefrontAccessToken
          },
          body: JSON.stringify({ query: filesQuery })
        });

        if (filesResponse.ok) {
          const filesData = await filesResponse.json();
          
          if (filesData.data && filesData.data.nodes) {
            // Map file GIDs to URLs
            const fileUrlMap = {};
            filesData.data.nodes.forEach(node => {
              if (node && node.id && node.image && node.image.url) {
                fileUrlMap[node.id] = node.image.url;
              }
            });

            // Assign URLs to items
            items.forEach(item => {
              if (item.fileGid && fileUrlMap[item.fileGid]) {
                item.imageUrl = fileUrlMap[item.fileGid];
              }
            });
          }
        }
      }

      // Filter out items without images and sort
      const validItems = items.filter(item => item.imageUrl);
      validItems.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

      return validItems;
    }

    // Render the gallery grid
    function renderGallery(items) {
      const gridHTML = items.map((item, index) => `
        <div class="gallery-item" data-item-id="${item.id}">
          <div class="gallery-item-checkbox">
            <input 
              type="checkbox" 
              id="item-${index}" 
              class="item-checkbox"
              data-image-url="${item.imageUrl}"
              data-description="${escapeHtml(item.description)}"
            >
            <label for="item-${index}">Select</label>
          </div>
          
          <div class="gallery-item-image">
            <img 
              src="${item.imageUrl}" 
              alt="${escapeHtml(item.description)}"
              loading="lazy"
            >
          </div>
          
          <div class="gallery-item-description">
            <p>${escapeHtml(item.description)}</p>
          </div>
        </div>
      `).join('');

      galleryContainer.innerHTML = `<div class="gallery-grid">${gridHTML}</div>`;
      
      // Cache checkbox references
      checkboxes = Array.from(document.querySelectorAll('.item-checkbox'));
    }

    // Setup event listeners
    function setupEventListeners() {
      selectAllBtn.addEventListener('click', selectAll);
      deselectAllBtn.addEventListener('click', deselectAll);
      exportBtn.addEventListener('click', exportToPDF);
      
      checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectionUI);
      });

      updateSelectionUI();
    }

    // Select all items
    function selectAll() {
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
      });
      updateSelectionUI();
    }

    // Deselect all items
    function deselectAll() {
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
      updateSelectionUI();
    }

    // Update selection count and UI
    function updateSelectionUI() {
      const selectedCount = checkboxes.filter(cb => cb.checked).length;
      selectionCount.textContent = `${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected`;
      exportBtn.disabled = selectedCount === 0;

      // Update visual state of gallery items
      const galleryItemElements = document.querySelectorAll('.gallery-item');
      galleryItemElements.forEach((item, index) => {
        if (checkboxes[index].checked) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    }

    // Export to PDF
    async function exportToPDF() {
      const selectedCheckboxes = checkboxes.filter(cb => cb.checked);
      
      if (selectedCheckboxes.length === 0) {
        alert('Please select at least one item to export.');
        return;
      }

      loadingOverlay.classList.remove('hidden');

      try {
        await generatePDF(selectedCheckboxes);
      } catch (error) {
        console.error('PDF generation error:', error);
        alert('There was an error generating the PDF. Please try again.');
      } finally {
        loadingOverlay.classList.add('hidden');
      }
    }

    // Generate PDF from selected items
    async function generatePDF(selectedCheckboxes) {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter' // 8.5 x 11 inches
      });

      let isFirstPage = true;

      for (const checkbox of selectedCheckboxes) {
        if (!isFirstPage) {
          pdf.addPage();
        }
        isFirstPage = false;

        const imageUrl = checkbox.dataset.imageUrl;
        const description = checkbox.dataset.description;

        // Load image
        const imgData = await loadImage(imageUrl);
        
        // Page dimensions
        const pageWidth = 8.5;
        const pageHeight = 11;
        const topMargin = 1; // 1 inch from top
        const sideMargin = 0.75; // 0.75 inch from sides
        
        // For 1080x1080 square images, calculate optimal size
        // Max width available: 8.5 - (0.75 * 2) = 7 inches
        const maxImageWidth = pageWidth - (sideMargin * 2);
        
        // Since images are square (1080x1080), use same value for width and height
        // Set to 6.5 inches to leave room for description and look balanced
        const imageSize = 6.5;
        
        // Center the square image horizontally
        const xPosition = (pageWidth - imageSize) / 2;
        const yPosition = topMargin;
        
        // Add image to PDF (square dimensions)
        pdf.addImage(imgData, 'JPEG', xPosition, yPosition, imageSize, imageSize);
        
        // Add description below image
        const descriptionY = yPosition + imageSize + 0.4; // 0.4 inch gap below image
        const textMargin = 1; // Text margins from page edges
        const maxTextWidth = pageWidth - (textMargin * 2);
        
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');
        
        // Word wrap the description
        const textLines = pdf.splitTextToSize(description, maxTextWidth);
        pdf.text(textLines, textMargin, descriptionY);
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `gallery-export-${timestamp}.pdf`;
      
      // Save the PDF
      pdf.save(filename);
    }

    // Load image as base64 data URL
    function loadImage(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        
        img.onload = function() {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        
        img.onerror = function() {
          reject(new Error(`Failed to load image: ${url}`));
        };
        
        img.src = url;
      });
    }

    // Show empty state
    function showEmptyState() {
      galleryContainer.innerHTML = `
        <div class="empty-state">
          <p>No gallery items found. Add items in Shopify admin under Content > Metaobjects > Gallery Items.</p>
        </div>
      `;
    }

    // Show error state
    function showErrorState(message) {
      galleryContainer.innerHTML = `
        <div class="error-state">
          <p><strong>Error loading gallery:</strong> ${escapeHtml(message)}</p>
          <p style="margin-top: 10px; font-size: 14px;">Make sure your Storefront API token is configured correctly in the gallery-script.js file.</p>
        </div>
      `;
    }

    // Utility: Escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }
})();
