/**
 * Entry point for the hand probability calculator page.
 */

import { getCardDatabase, buildCardLookup } from './cardDb.js';
import { parseYdk, validateDeck } from './ydkParser.js';
import { init, renderDeck, showWarnings } from './handsUi.js';

async function loadCardDb() {
  const cards = await getCardDatabase();
  return buildCardLookup(cards);
}

async function handleFile(file) {
  if (!file || !file.name.endsWith('.ydk')) {
    alert('Please select a .ydk file');
    return;
  }

  const text = await file.text();
  const parsed = parseYdk(text);
  const warnings = validateDeck(parsed);

  if (parsed.main.length === 0) {
    alert('No main deck cards found in the .ydk file');
    return;
  }

  // Load card DB if not already loaded
  const cardLookup = await loadCardDb();
  init(cardLookup);
  showWarnings(warnings);
  renderDeck(parsed);
}

// --- File input ---
document.getElementById('ydkFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

// --- Drag and drop ---
const dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// Also allow clicking the drop zone to trigger file input
dropZone.addEventListener('click', () => {
  document.getElementById('ydkFile').click();
});
