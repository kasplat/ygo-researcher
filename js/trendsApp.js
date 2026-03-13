/**
 * Entry point for the Trends page.
 * Orchestrates data fetch, category management, analysis, and rendering.
 */

import { getCardDatabase, buildCardLookup } from './cardDb.js';
import { fetchDecks, fetchArchetypes } from './api.js';
import { parseRelativeDate } from './dateParser.js';
import { initClassifier, classifyDeck } from './archetypeClassifier.js';
import { getCachedDecks, setCachedDecks } from './deckCache.js';
import { getCategories, saveCategories, resetToDefaults } from './cardCategories.js';
import { analyzeCategory } from './trendsAnalyzer.js';
import * as ui from './trendsUi.js';

let currentDecks = null;
let currentCardLookup = null;
let categories = getCategories();
let activeCategoryId = categories[0]?.id || null;
let allCardIdsInData = []; // all unique card IDs found across all decks

function activeCategory() {
  return categories.find(c => c.id === activeCategoryId) || categories[0];
}

function runAnalysisAndRender() {
  if (!currentDecks || !currentCardLookup) return;
  const cat = activeCategory();
  if (!cat) return;

  const analysis = analyzeCategory(currentDecks, currentCardLookup, cat);

  ui.showResults();
  ui.renderSummary(analysis);
  ui.renderCategoryTabs(categories, activeCategoryId, selectCategory, addCategory, deleteCategory, renameCategory);
  ui.renderCardChips(cat, currentCardLookup, allCardIdsInData, removeCardFromCategory, addCardToCategory);
  ui.renderHeatmap(analysis);
  ui.renderDistributionTable(analysis);
}

function selectCategory(catId) {
  activeCategoryId = catId;
  runAnalysisAndRender();
}

function addCategory() {
  const name = prompt('Category name:');
  if (!name) return;
  const id = 'custom-' + Date.now();
  const zone = prompt('Deck zone? (main or side)', 'main');
  if (zone !== 'main' && zone !== 'side') return;
  categories.push({ id, name, zone, cardIds: [], isDefault: false });
  saveCategories(categories);
  activeCategoryId = id;
  runAnalysisAndRender();
}

function deleteCategory(catId) {
  const cat = categories.find(c => c.id === catId);
  if (!cat || cat.isDefault) return;
  if (!confirm(`Delete category "${cat.name}"?`)) return;
  categories = categories.filter(c => c.id !== catId);
  saveCategories(categories);
  if (activeCategoryId === catId) {
    activeCategoryId = categories[0]?.id || null;
  }
  runAnalysisAndRender();
}

function renameCategory(catId) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;
  const name = prompt('New name:', cat.name);
  if (!name) return;
  cat.name = name;
  saveCategories(categories);
  runAnalysisAndRender();
}

function removeCardFromCategory(cardId) {
  const cat = activeCategory();
  if (!cat) return;
  cat.cardIds = cat.cardIds.filter(id => String(id) !== String(cardId));
  saveCategories(categories);
  runAnalysisAndRender();
}

function addCardToCategory(cardId) {
  const cat = activeCategory();
  if (!cat) return;
  if (!cat.cardIds.includes(String(cardId))) {
    cat.cardIds.push(String(cardId));
    saveCategories(categories);
  }
  runAnalysisAndRender();
}

// Collect all unique card IDs from all decks (for add-card dropdown)
function collectAllCardIds(decks) {
  const ids = new Set();
  for (const deck of decks) {
    for (const id of (deck.mainDeckIds || [])) ids.add(String(id));
    for (const id of (deck.sideDeckIds || [])) ids.add(String(id));
  }
  return [...ids];
}

// --- Main flow ---

document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const rangeDays = parseInt(document.getElementById('timeRange').value);

  ui.showLoading();

  try {
    // Step 1: Load card DB + archetypes
    ui.updateStatus('Loading card database...');
    const [cards, archetypeList] = await Promise.all([
      getCardDatabase(),
      fetchArchetypes()
    ]);
    currentCardLookup = buildCardLookup(cards);
    initClassifier(archetypeList);

    // Step 2: Try cache, otherwise fetch
    let decks = getCachedDecks(rangeDays);
    if (decks) {
      ui.showCacheIndicator();
    } else {
      ui.updateStatus('Fetching tournament decks...');
      decks = await fetchDecks(rangeDays, (loaded, offset) => {
        ui.updateProgress(loaded, offset);
      });

      if (decks.length === 0) {
        ui.showError('No tournament meta decks found. Try a longer time range.');
        return;
      }

      // Classify
      ui.updateStatus('Classifying decks...');
      for (const deck of decks) {
        deck.parsedDate = parseRelativeDate(deck.submit_date);
        deck.archetype = classifyDeck(deck.deck_name);
      }

      // Cache for other pages
      setCachedDecks(rangeDays, decks);
    }

    currentDecks = decks;
    allCardIdsInData = collectAllCardIds(decks);

    // Step 3: Analyze and render
    ui.hideLoading();
    runAnalysisAndRender();

  } catch (err) {
    console.error('Analysis failed:', err);
    ui.showError(`Analysis failed: ${err.message}`);
  }
});

// Reset categories button
document.getElementById('resetCategories')?.addEventListener('click', () => {
  if (!confirm('Reset all categories to defaults? Custom categories will be deleted.')) return;
  categories = resetToDefaults();
  activeCategoryId = categories[0]?.id || null;
  if (currentDecks) runAnalysisAndRender();
});
