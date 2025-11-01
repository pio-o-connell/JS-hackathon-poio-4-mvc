/**
 * controller.js
 * Connects the QuizView (View) events to the QuizEngine (Model) logic.
 * Implements the game state and uses the View methods to update the DOM.
 */

(function () {
  const view = new window.QuizView();
  const quizEngine = window.quiz; // model instance

  const gameState = {
    currentGameType: null,
    selectedCountryName: null,
    questions: [],
    currentQuestionIndex: 0,
    hasAnswered: false,
    totalQuestions: 0,
    isComplete: false
  };

  // Performance tracking for adaptive difficulty
  let correctStreak = 0;
  let wrongStreak = 0;

  // Helpers
  function enableLeftPane(gameType) {
    const leftPane = document.querySelector('.left-pane');
    if (!leftPane) return;
    leftPane.classList.remove('disabled');
    leftPane.classList.remove('transparent');
    leftPane.classList.add('visible');
    // style items according to mode color
    const color = getModeColor(gameType);
    document.querySelectorAll('.item-list .country').forEach(country => {
      country.style.color = color;
      country.style.borderColor = color;
      country.classList.remove('selected-country');
    });
  }

  function getModeColor(mode) { if (!mode) return '#000'; const styles = getComputedStyle(document.documentElement); const value = styles.getPropertyValue(`--${mode}-color`); return value ? value.trim() : '#000'; }

  // Event handlers from View
  document.addEventListener('view:mode-selected', (e) => {
    const type = e?.detail?.type;
    if (!type || !['population','currency','languages'].includes(type)) return;
    gameState.currentGameType = type;
    gameState.selectedCountryName = null;
    gameState.questions = [];
    gameState.currentQuestionIndex = 0;
    gameState.hasAnswered = false;
    gameState.totalQuestions = 0;
    gameState.isComplete = false;

    enableLeftPane(type);
    view.updateStatusMessage(`${view.capitalize(type)} quiz selected. Choose a country.`, getModeColor(type));
    view.resetRightPaneBeforeQuiz();
  });

  // Difficulty change initiated by the View (user selected)
  document.addEventListener('view:difficulty-changed', (e) => {
    const level = e?.detail?.level;
    if (!level) return;
    if (quizEngine && typeof quizEngine.setDifficulty === 'function') {
      // Do not reload the visible country pool when the user selects difficulty
      // to avoid disrupting their current selection.
      quizEngine.setDifficulty(level, false);
    }
    view.updateStatusMessage(`Difficulty set to ${view.capitalize(level)}. Choose a country.`, getModeColor(gameState.currentGameType));
  });

  document.addEventListener('view:country-selected', (e) => {
    const { name, item } = e.detail || {};
    if (!gameState.currentGameType) {
      view.updateStatusMessage('Select a quiz type first to unlock the countries.', '#d9534f');
      return;
    }
    if (!name || name.toLowerCase().includes('waiting')) {
      view.updateStatusMessage('Country data is still loading. Please try again in a moment.', '#d9534f');
      return;
    }

    // select UI
    document.querySelectorAll('.item-list .country.selected-country').forEach(el => el.classList.remove('selected-country'));
    try { item.classList.add('selected-country'); } catch (e) {}

    gameState.selectedCountryName = name;
    gameState.questions = [];
    gameState.currentQuestionIndex = 0;
    gameState.hasAnswered = false;
    gameState.totalQuestions = 0;
    gameState.isComplete = false;

    view.updateStatusMessage(`You selected ${name}. Click "Start Quiz" to begin the ${gameState.currentGameType} challenge.`, getModeColor(gameState.currentGameType));
    view.setupRightPaneGameArea(name, gameState.currentGameType);
  });

  document.addEventListener('view:start-quiz', (e) => {
    // If quiz is complete, treat this as a Play Again trigger
    if (gameState.isComplete) {
      handlePlayAgain();
      return;
    }
    beginQuiz();
  });

  document.addEventListener('view:answer-selected', (e) => {
    const selectedIndex = e?.detail?.selectedIndex;
    if (gameState.isComplete) return;
    const q = gameState.questions[gameState.currentQuestionIndex];
    if (!q || Number.isNaN(selectedIndex) || gameState.hasAnswered) return;

    gameState.hasAnswered = true;
    // disable buttons
    view.toggleAnswerButtons(true, false);

    // mark selection
    const buttons = Array.from(document.querySelectorAll('.answer-option'));
    const button = buttons[selectedIndex];
    if (button) button.classList.add('selected');

    const correctButton = buttons[q.correctIndex];
    if (correctButton) correctButton.classList.add('correct');
    if (selectedIndex !== q.correctIndex) {
      if (button) button.classList.add('incorrect');
      view.incrementWrongAnswer();
      wrongStreak += 1; correctStreak = 0;
      const correctLabel = q.options[q.correctIndex]?.label || q.correctAnswerLabel;
      view.setFeedback(`Not quite. The correct answer is ${correctLabel}.`, false);
      // adapt difficulty downward if player struggles
      if (wrongStreak >= 2) {
        downgradeDifficulty();
        wrongStreak = 0;
      }
    } else {
      view.incrementScore();
      correctStreak += 1; wrongStreak = 0;
      view.setFeedback(q.explanation || 'Great job!', true);
      // adapt difficulty upward if player is on a streak
      if (correctStreak >= 3) {
        upgradeDifficulty();
        correctStreak = 0;
      }
    }

    // reveal next/finish button
    const nextBtn = document.getElementById('nextQuestionBtn');
    if (nextBtn) {
      nextBtn.classList.remove('hidden');
      nextBtn.disabled = false;
      if (gameState.currentQuestionIndex === gameState.totalQuestions - 1) nextBtn.textContent = 'Finish Quiz';
      nextBtn.setAttribute('aria-hidden','false');
    }
  });

  document.addEventListener('view:next-question', () => {
    if (gameState.isComplete) {
      // restart
      beginQuiz();
      return;
    }
    if (!gameState.hasAnswered) { view.setFeedback('Pick an answer before moving on.', null); return; }
    gameState.currentQuestionIndex += 1;
    if (gameState.currentQuestionIndex >= gameState.totalQuestions) { finalizeQuiz(); return; }
    gameState.hasAnswered = false;
    view.toggleAnswerButtons(false, false);
    const q = gameState.questions[gameState.currentQuestionIndex];
    view.renderQuestion(q, gameState.currentQuestionIndex, gameState.totalQuestions);
  });

  function beginQuiz() {
    if (!gameState.currentGameType) { view.updateStatusMessage('Select a quiz type first.', '#d9534f'); view.restoreStartButton(); return; }
    if (!gameState.selectedCountryName) { view.updateStatusMessage('Choose a country from the left pane before starting.', '#d9534f'); return; }
    if (!quizEngine || !Array.isArray(quizEngine.countryPool) || quizEngine.countryPool.length === 0) { view.updateStatusMessage('Still gathering country data. Please try again in a moment.', '#d9534f'); return; }

  // disable controls during an active quiz
  view.disableGameControls();
  view.showOverlay('Preparing questions...');
    view.toggleAnswerButtons(true, true);
    view.hideQuizRowsUntilStart();

    setTimeout(() => {
      // attempt to generate question set
      let questions = [];
      try {
        questions = quizEngine.generateQuestionSet(gameState.currentGameType, 10);
      } catch (err) {
        console.error('generateQuestionSet failed', err);
        view.updateStatusMessage('Unable to create questions right now. Please try again.', '#d9534f');
        view.restoreStartButton();
        view.hideOverlay();
        return;
      }

      if (!Array.isArray(questions) || questions.length === 0) {
        view.updateStatusMessage('Not enough data to start this quiz. Try another category.', '#d9534f');
        view.restoreStartButton();
        view.hideOverlay();
        return;
      }

      gameState.questions = questions;
      gameState.totalQuestions = questions.length;
      gameState.currentQuestionIndex = 0;
      gameState.hasAnswered = false;
      gameState.isComplete = false;

      // reset scores
      view.setScoreValue('score', 0);
      view.setScoreValue('incorrect', 0);

  view.hideOverlay();
      view.showQuizRows();
      view.toggleAnswerButtons(false, true);
      const startBtn = document.getElementById('showOverlayBtn');
      if (startBtn) { startBtn.classList.add('hidden'); startBtn.setAttribute('aria-hidden','true'); }

      view.updateStatusMessage('Answer the quiz questions displayed on the right pane.', getModeColor(gameState.currentGameType));
      // render first question
      const q0 = gameState.questions[0];
      view.renderQuestion(q0, 0, gameState.totalQuestions);
    }, 500);
  }

  function finalizeQuiz() {
    gameState.isComplete = true;
    view.toggleAnswerButtons(true, false);
    const correctAnswers = view.getScoreValue('score');
    const totalAsked = gameState.totalQuestions;
    const summary = `Quiz complete! You answered ${correctAnswers} out of ${totalAsked} correctly.`;
    view.setFeedback(summary, true);

    const nextBtn = document.getElementById('nextQuestionBtn');
    if (nextBtn) {
      nextBtn.classList.remove('hidden');
      nextBtn.disabled = false;
      nextBtn.textContent = 'Restart Quiz';
      nextBtn.setAttribute('aria-hidden','false');
    }

    const startBtn = document.getElementById('showOverlayBtn');
    if (startBtn) {
      startBtn.classList.remove('hidden');
      startBtn.removeAttribute('disabled');
      startBtn.textContent = 'Play Again';
      startBtn.setAttribute('aria-hidden','false');
      // Keep using the same view:start-quiz event — controller will treat start when gameState.isComplete as play again
    }
    // re-enable UI controls now that the quiz has finished
    view.enableGameControls();

    view.updateStatusMessage('Quiz complete! Pick a new category or play again to improve your score.', getModeColor(gameState.currentGameType));
  }

  function handlePlayAgain() {
    if (quizEngine && typeof quizEngine.populateCountryPool === 'function') {
      try { quizEngine.populateCountryPool(); } catch (e) { console.warn('Play Again: failed to repopulate country pool', e); }
    }
    document.querySelectorAll('.item-list .country.selected-country').forEach(el => el.classList.remove('selected-country'));
    gameState.selectedCountryName = null;
    gameState.questions = [];
    gameState.currentQuestionIndex = 0;
    gameState.hasAnswered = false;
    gameState.isComplete = false;
    view.resetRightPaneBeforeQuiz();
    if (gameState.currentGameType) {
      enableLeftPane(gameState.currentGameType);
      view.updateStatusMessage(`New countries loaded. Choose a country for ${view.capitalize(gameState.currentGameType)}.`, getModeColor(gameState.currentGameType));
    } else {
      view.updateStatusMessage('New countries loaded. Select a quiz type and choose a country.');
    }
    // restore start button to normal behaviour (view dispatch still sends view:start-quiz)
    const startBtn = document.getElementById('showOverlayBtn');
    if (startBtn) { startBtn.textContent = 'Start Quiz'; startBtn.classList.add('hidden'); startBtn.setAttribute('aria-hidden','true'); }
  }

  // Difficulty helpers for adaptive progression
  function difficultyOrder() { return ['easy','medium','hard']; }

  function upgradeDifficulty() {
    if (!quizEngine || typeof quizEngine.getDifficulty !== 'function') return;
    const current = quizEngine.getDifficulty();
    const order = difficultyOrder();
    const idx = order.indexOf(current);
    if (idx === -1 || idx >= order.length - 1) return; // already at top
    const next = order[idx + 1];
    // Change difficulty internally but do not reload current country list immediately
    quizEngine.setDifficulty(next, false);
    view.updateStatusMessage(`Difficulty increased to ${view.capitalize(next)} — questions will become harder.`, getModeColor(gameState.currentGameType));
  }

  function downgradeDifficulty() {
    if (!quizEngine || typeof quizEngine.getDifficulty !== 'function') return;
    const current = quizEngine.getDifficulty();
    const order = difficultyOrder();
    const idx = order.indexOf(current);
    if (idx <= 0) return; // already at easiest
    const next = order[idx - 1];
    // Change difficulty internally but do not reload current country list immediately
    quizEngine.setDifficulty(next, false);
    view.updateStatusMessage(`Difficulty decreased to ${view.capitalize(next)} — easier questions now.`, getModeColor(gameState.currentGameType));
  }

})();
