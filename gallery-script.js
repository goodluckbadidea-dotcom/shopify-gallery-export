// Configuration
const CONFIG = {
    shopUrl: 'dropscandies.com',
    storefrontToken: 'f8f837e6b0397c06f037a0aef2aa1037'
};

// State management
const state = {
    currentView: 'gallery',
    galleryItems: [],
    deckItems: [],
    selectedGalleryItems: new Set(),
    selectedDeckItems: new Set()
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeToggle();
    initializeControls();
    loadAllData();
});

// Toggle functionality
function initializeToggle() {
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(view) {
    state.currentView = view;
    
    // Update toggle buttons
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Update view containers
    const galleryView = document.getElementById('galleryView');
    const decksView = document.getElementById('decksView');
    
    if (view === 'gallery') {
        galleryView.classList.add('active-view');
        decksView.classList.remove('active-view');
    } else {
        galleryView.classList.remove('active-view');
        decksView.classList.add('active-view');
    }
    
    updateExportButton();
}

// Controls
function initializeControls() {
    const selectAllBtn = document.getElementById('selectAll');
    const exportBtn = document.getElementById('exportBtn');
    
    selectAllBtn.addEventListener('click', handleSelectAll);
    exportBtn.addEventListener('click', handleExport);
}

function handleSelectAll() {
    if (state.currentView === 'gallery') {
        const allSelected = state.selectedGalleryItems.size === state.galleryItems.length;
        
        if (allSelected) {
            state.selectedGalleryItems.clear();
        } else {
            state.galleryItems.forEach((_, index) => {
                state.selectedGalleryItems.add(index);
            });
        }
        
        updateGalleryCheckboxes();
    } else {
        const allSelected = state.selectedDeckItems.size === state.deckItems.length;
        
        if (allSelected) {
            state.selectedDeckItems.clear();
        } else {
            state.deckItems.forEach((_, index) => {
                state.selectedDeckItems.add(index);
            });
        }
        
        updateDeckCheckboxes();
    }
    
    updateExportButton();
}

function updateExportButton() {
    const exportBtn = document.getElementById('exportBtn');
    const hasSelection = state.currentView === 'gallery' 
        ? state.selectedGalleryItems.size > 0 
        : state.selectedDeckItems.size > 0;
    
    exportBtn.disabled = !hasSelection;
}

// Data Loading
async function loadAllData() {
    showLoading();
    
    try {
        // Always fetch gallery items
        const galleryData = await fetchGalleryItems();
        state.galleryItems = galleryData;
        renderGallery();
        
        // Try to fetch presentation decks, but don't fail if it doesn't work
        try {
            const decksData = await fetchPresentationDecks();
            state.deckItems = decksData;
            renderDecks();
        } catch (deckError) {
            console.warn('Presentation decks not available:', deckError);
            state.deckItems = [];
            renderDecks(); // Render empty decks view
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading gallery items:', error);
        showError('Failed to load gallery items. Please refresh the page and try again.');
        hideLoading();
    }
}

async function fetchGalleryItems() {
    const query = `
    {
        metaobjects(type: "gallery_item", first: 50) {
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
    
    const response = await fetch(`https://${CONFIG.shopUrl}/api/unstable/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': CONFIG.storefrontToken
        },
        body: JSON.stringify({ query })
    });
    
    const data = await response.json();
    
    if (data.errors) {
        console.error('Gallery fetch errors:', data.errors);
        throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
    }
    
    return parseGalleryItems(data);
}

async function fetchPresentationDecks() {
    const query = `
    {
        metaobjects(type: "presentation_deck", first: 50) {
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
    
    const response = await fetch(`https://${CONFIG.shopUrl}/api/unstable/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': CONFIG.storefrontToken
        },
        body: JSON.stringify({ query })
    });
    
    const data = await response.json();
    
    if (data.errors) {
        console.error('Presentation decks fetch errors:', data.errors);
        throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
    }
    
    return parseDeckItems(data);
}

function parseGalleryItems(data) {
    const items = [];
    
    if (!data.data || !data.data.metaobjects) {
        return items;
    }
    
    data.data.metaobjects.edges.forEach(edge => {
        const item = { id: edge.node.id };
        
        edge.node.fields.forEach(field => {
            if (field.key === 'image_url') {
                item.imageUrl = field.value;
            } else if (field.key === 'description') {
                item.description = field.value;
            }
        });
        
        if (item.imageUrl) {
            items.push(item);
        }
    });
    
    return items;
}

function parseDeckItems(data) {
    const items = [];
    
    if (!data.data || !data.data.metaobjects) {
        return items;
    }
    
    data.data.metaobjects.edges.forEach(edge => {
        const item = { id: edge.node.id };
        
        edge.node.fields.forEach(field => {
            if (field.key === 'title') {
                item.title = field.value;
            } else if (field.key === 'pdf_url') {
                item.pdfUrl = field.value;
            } else if (field.key === 'thumbnail_url') {
                item.thumbnailUrl = field.value;
            }
        });
        
        if (item.title && item.pdfUrl && item.thumbnailUrl) {
            items.push(item);
        }
    });
    
    return items;
}

// Rendering
function renderGallery() {
    const container = document.getElementById('galleryView');
    container.innerHTML = '';
    
    if (state.galleryItems.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">No gallery items found.</p>';
        return;
    }
    
    state.galleryItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'gallery-item';
        if (state.selectedGalleryItems.has(index)) {
            itemDiv.classList.add('selected');
        }
        
        itemDiv.innerHTML = `
            <input type="checkbox" ${state.selectedGalleryItems.has(index) ? 'checked' : ''}>
            <img src="${item.imageUrl}" alt="Gallery item ${index + 1}">
            <p>${item.description || ''}</p>
        `;
        
        itemDiv.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault();
                toggleGallerySelection(index);
            }
        });
        
        const checkbox = itemDiv.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', () => {
            toggleGallerySelection(index);
        });
        
        container.appendChild(itemDiv);
    });
}

function renderDecks() {
    const container = document.getElementById('decksView');
    container.innerHTML = '';
    
    if (state.deckItems.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">No presentation decks found. Add decks in Shopify Admin.</p>';
        return;
    }
    
    state.deckItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'deck-item';
        if (state.selectedDeckItems.has(index)) {
            itemDiv.classList.add('selected');
        }
        
        itemDiv.innerHTML = `
            <input type="checkbox" ${state.selectedDeckItems.has(index) ? 'checked' : ''}>
            <img src="${item.thumbnailUrl}" alt="${item.title}">
            <h3>${item.title}</h3>
        `;
        
        itemDiv.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault();
                toggleDeckSelection(index);
            }
        });
        
        const checkbox = itemDiv.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', () => {
            toggleDeckSelection(index);
        });
        
        container.appendChild(itemDiv);
    });
}

// Selection Management
function toggleGallerySelection(index) {
    if (state.selectedGalleryItems.has(index)) {
        state.selectedGalleryItems.delete(index);
    } else {
        state.selectedGalleryItems.add(index);
    }
    
    updateGalleryCheckboxes();
    updateExportButton();
}

function toggleDeckSelection(index) {
    if (state.selectedDeckItems.has(index)) {
        state.selectedDeckItems.delete(index);
    } else {
        state.selectedDeckItems.add(index);
    }
    
    updateDeckCheckboxes();
    updateExportButton();
}

function updateGalleryCheckboxes() {
    const items = document.querySelectorAll('#galleryView .gallery-item');
    items.forEach((item, index) => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const isSelected = state.selectedGalleryItems.has(index);
        checkbox.checked = isSelected;
        item.classList.toggle('selected', isSelected);
    });
}

function updateDeckCheckboxes() {
    const items = document.querySelectorAll('#decksView .deck-item');
    items.forEach((item, index) => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const isSelected = state.selectedDeckItems.has(index);
        checkbox.checked = isSelected;
        item.classList.toggle('selected', isSelected);
    });
}

// Export
async function handleExport() {
    if (state.currentView === 'gallery') {
        await exportGalleryPDF();
    } else {
        await exportPresentationDecks();
    }
}

async function exportGalleryPDF() {
    try {
        const exportBtn = document.getElementById('exportBtn');
        exportBtn.disabled = true;
        exportBtn.textContent = 'Generating PDF...';
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        let isFirstPage = true;
        
        const selectedIndices = Array.from(state.selectedGalleryItems).sort((a, b) => a - b);
        
        for (const index of selectedIndices) {
            const item = state.galleryItems[index];
            
            if (!isFirstPage) {
                pdf.addPage();
            }
            isFirstPage = false;
            
            try {
                const img = await loadImage(item.imageUrl);
                const imgWidth = 180;
                const imgHeight = (img.height / img.width) * imgWidth;
                
                pdf.addImage(img, 'JPEG', 15, 15, imgWidth, imgHeight);
                
                if (item.description) {
                    const yPosition = 15 + imgHeight + 10;
                    pdf.setFontSize(12);
                    const lines = pdf.splitTextToSize(item.description, 180);
                    pdf.text(lines, 15, yPosition);
                }
            } catch (error) {
                console.error('Error adding image to PDF:', error);
            }
        }
        
        pdf.save('gallery-export.pdf');
        
        exportBtn.disabled = false;
        exportBtn.textContent = 'Export PDF';
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Failed to generate PDF. Please try again.');
        
        const exportBtn = document.getElementById('exportBtn');
        exportBtn.disabled = false;
        exportBtn.textContent = 'Export PDF';
    }
}

async function exportPresentationDecks() {
    const selectedIndices = Array.from(state.selectedDeckItems).sort((a, b) => a - b);
    
    if (selectedIndices.length === 0) {
        return;
    }
    
    const exportBtn = document.getElementById('exportBtn');
    exportBtn.disabled = true;
    exportBtn.textContent = 'Downloading...';
    
    // Download each selected PDF
    for (let i = 0; i < selectedIndices.length; i++) {
        const index = selectedIndices[i];
        const item = state.deckItems[index];
        
        // Stagger downloads slightly to avoid browser blocking
        await new Promise(resolve => setTimeout(resolve, i * 500));
        
        try {
            // Fetch the PDF and force download
            const response = await fetch(item.pdfUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `${item.title}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the blob URL
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading PDF:', error);
            // Fallback to simple link
            const link = document.createElement('a');
            link.href = item.pdfUrl;
            link.download = `${item.title}.pdf`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export PDF';
}

// Utility functions
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

function showLoading() {
    const loadingDiv = document.getElementById('loading');
    const galleryView = document.getElementById('galleryView');
    const decksView = document.getElementById('decksView');
    
    loadingDiv.style.display = 'block';
    galleryView.style.display = 'none';
    decksView.style.display = 'none';
}

function hideLoading() {
    const loadingDiv = document.getElementById('loading');
    const galleryView = document.getElementById('galleryView');
    const decksView = document.getElementById('decksView');
    
    loadingDiv.style.display = 'none';
    
    // Restore view display by removing inline styles
    galleryView.style.display = '';
    decksView.style.display = '';
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}
