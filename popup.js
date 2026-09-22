// PDF Viewer Extension - Main Logic

let pdfDoc = null;
let currentPage = 1;
let pageRendering = false;
let pageNumPending = null;
const scale = 1.5;

// Elements
const fileInput = document.getElementById('pdfFile');
const uploadArea = document.getElementById('uploadArea');
const viewerContainer = document.getElementById('viewer-container');
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const pdfInfo = document.getElementById('pdf-info');
const currentPageSpan = document.getElementById('currentPage');
const totalPagesSpan = document.getElementById('totalPages');
const prevButton = document.getElementById('prevPage');
const nextButton = document.getElementById('nextPage');
const errorDiv = document.getElementById('error');

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

// Upload area click
uploadArea.addEventListener('click', () => {
  fileInput.click();
});

// File selection
fileInput.addEventListener('change', handleFileSelect);

// Drag & drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type === 'application/pdf') {
    handleFile(files[0]);
  } else {
    showError('Please drop a valid PDF file');
  }
});

// Navigation buttons
prevButton.addEventListener('click', () => {
  if (currentPage <= 1) return;
  currentPage--;
  queueRenderPage(currentPage);
});

nextButton.addEventListener('click', () => {
  if (currentPage >= pdfDoc.numPages) return;
  currentPage++;
  queueRenderPage(currentPage);
});

// Handle file selection
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
  }
}

// Handle file
async function handleFile(file) {
  if (file.type !== 'application/pdf') {
    showError('Please select a valid PDF file');
    return;
  }
  
  hideError();
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    await loadPDF(arrayBuffer, file.name);
  } catch (error) {
    showError(`Failed to load PDF: ${error.message}`);
  }
}

// Load PDF
async function loadPDF(arrayBuffer, filename) {
  try {
    const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
    pdfDoc = await loadingTask.promise;
    
    // Show viewer
    uploadArea.style.display = 'none';
    viewerContainer.style.display = 'block';
    
    // Update info
    totalPagesSpan.textContent = pdfDoc.numPages;
    pdfInfo.innerHTML = `
      <strong>File:</strong> ${filename}<br>
      <strong>Pages:</strong> ${pdfDoc.numPages}<br>
      <strong>Version:</strong> PDF ${pdfDoc.pdfInfo.PDFFormatVersion}
    `;
    
    // Render first page
    currentPage = 1;
    renderPage(currentPage);
    
  } catch (error) {
    showError(`Failed to load PDF: ${error.message}`);
  }
}

// Render page
async function renderPage(num) {
  pageRendering = true;
  
  try {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({scale});
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    pageRendering = false;
    
    // Update UI
    currentPageSpan.textContent = num;
    prevButton.disabled = (num <= 1);
    nextButton.disabled = (num >= pdfDoc.numPages);
    
    // If another page rendering was pending
    if (pageNumPending !== null) {
      renderPage(pageNumPending);
      pageNumPending = null;
    }
    
  } catch (error) {
    pageRendering = false;
    showError(`Failed to render page: ${error.message}`);
  }
}

// Queue page rendering
function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    renderPage(num);
  }
}

// Show error
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Hide error
function hideError() {
  errorDiv.style.display = 'none';
}

// Store last viewed PDF in chrome.storage (for future feature)
async function saveLastPDF(filename) {
  try {
    await chrome.storage.local.set({ lastPDF: filename });
  } catch (error) {
    console.error('Failed to save to storage:', error);
  }
}
