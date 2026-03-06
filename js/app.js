/**
 * Entry point: wires controls, orchestrates the analysis flow.
 */

import { getCardDatabase, buildCardLookup } from './cardDb.js';
import { fetchDecks, fetchArchetypes } from './api.js';
import { parseRelativeDate } from './dateParser.js';
import { initClassifier, classifyDeck } from './archetypeClassifier.js';
import { analyzeDecks } from './analyzer.js';
import * as ui from './ui.js';

// Set up global card link click delegation
ui.setupCardLinkDelegation();

document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const rangeDays = parseInt(document.getElementById('timeRange').value);

  ui.showLoading();

  try {
    // Step 1: Load card DB + archetypes in parallel (cached)
    ui.updateStatus('Loading card database...');
    const [cards, archetypeList] = await Promise.all([
      getCardDatabase(),
      fetchArchetypes()
    ]);
    const cardLookup = buildCardLookup(cards);
    initClassifier(archetypeList);

    // Step 2: Fetch tournament meta decks with progress
    ui.updateStatus('Fetching tournament decks...');
    const decks = await fetchDecks(rangeDays, (loaded, offset) => {
      ui.updateProgress(loaded, offset);
    });

    if (decks.length === 0) {
      ui.showError('No tournament meta decks found in the selected time range. Try a longer range.');
      return;
    }

    // Step 3: Parse dates and classify archetypes
    ui.updateStatus('Classifying decks...');
    for (const deck of decks) {
      deck.parsedDate = parseRelativeDate(deck.submit_date);
      deck.archetype = classifyDeck(deck.deck_name);
    }

    // Step 4: Run statistical analysis
    ui.updateStatus('Analyzing card frequencies...');
    const results = analyzeDecks(decks, cardLookup);

    // Step 5: Render everything
    ui.hideLoading();
    ui.renderResults(results, decks, cardLookup);

  } catch (err) {
    console.error('Analysis failed:', err);
    ui.showError(`Analysis failed: ${err.message}`);
  }
});
