/**
 * view.js
 * QuizView (View) - Responsible for all DOM updates and exposing user
 * interactions as CustomEvents so the Controller can react. Keeps DOM logic
 * encapsulated here; does not contain quiz-generation logic.
 */

class QuizView {
  constructor() {
    this.answerButtons = [];
    this.nextQuestionButton = null;
    this.feedbackElement = null;
    this.rightPaneElement = null;
    this.startQuizButton = null;
    this.overlayElement = null;
    this.questionElement = null;
    this.statusMessageElement = null;
    // initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
    // listen for model events
    document.addEventListener('quiz:pool-updated', (e) => {
      this.updateLeftPaneCountryList(e.detail && e.detail.pool ? e.detail.pool : []);
    });
    document.addEventListener('quiz:ready', (e) => {
      const loaded = e?.detail?.loaded ?? 0;
      this.updateStatusMessage(loaded > 0 ? 'Select a quiz type, then choose a country to get started.' : 'Unable to load country data. Refresh and try again.');
    });
  }

  init() {
    this.cacheDomReferences();
    this.setupModeButtons();
    this.setupDifficultySelector();
    this.setupCountrySelection();
    this.setupAnswerControls();
    this.setupNextButton();
    this.setupStartButton();
    // Ensure a default mode is selected on startup
    // This will visually mark 'population' selected and notify the controller
    this.selectMode('population', true);
  }

  cacheDomReferences() {
    this.rightPaneElement = document.querySelector('.right-pane');
    this.startQuizButton = document.getElementById('showOverlayBtn');
    this.overlayElement = this.rightPaneElement ? this.rightPaneElement.querySelector('.overlay') : null;
    this.questionElement = this.rightPaneElement ? this.rightPaneElement.querySelector('.row-1 .question-text') : null;
    this.feedbackElement = this.rightPaneElement ? this.rightPaneElement.querySelector('.row-4 .feedback') : null;
    this.statusMessageElement = document.querySelector('.message-info-disabled');
  }

  setupModeButtons() {
    const modeButtons = document.querySelectorAll('button[data-type]');
    modeButtons.forEach(button => {
      button.addEventListener('click', (ev) => {
        const type = ev.currentTarget.getAttribute('data-type');
        // update visual selection and notify controller
        this.selectMode(type, true);
      });
    });
  }

  /**
   * Visually select a mode button and optionally emit the view:mode-selected event.
   * Ensures one mode is always selected. When emit=true a CustomEvent is dispatched.
   */
  selectMode(type, emit = false) {
    const modeButtons = document.querySelectorAll('button[data-type]');
    modeButtons.forEach(btn => {
      const t = btn.getAttribute('data-type');
      if (t === type) {
        btn.classList.add('mode-selected');
        // also apply the hover/active visual by mirroring the hover styles
        btn.style.backgroundColor = (btn.classList.contains('btn--green') ? 'darkgreen' : (btn.classList.contains('btn--blue') ? 'darkblue' : (btn.classList.contains('btn--orange') ? 'darkorange' : '')));
        btn.style.color = 'white';
      } else {
        btn.classList.remove('mode-selected');
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }
    });
    if (emit) {
      document.dispatchEvent(new CustomEvent('view:mode-selected', { detail: { type } }));
    }
  }

  // Difficulty selector wiring
  setupDifficultySelector() {
    const selector = document.getElementById('difficulty-select');
    if (!selector) return;
    selector.addEventListener('change', (ev) => {
      const level = ev.currentTarget.value;
      document.dispatchEvent(new CustomEvent('view:difficulty-changed', { detail: { level } }));
    });

    // Keep the selector in sync with model events
    document.addEventListener('quiz:difficulty-changed', (e) => {
      const difficulty = e?.detail?.difficulty;
      if (!difficulty) return;
      selector.value = difficulty;
    });
  }

  setupCountrySelection() {
    const countries = document.querySelectorAll('.item-list .country');
    countries.forEach(item => {
      item.addEventListener('click', () => {
        const name = item.textContent ? item.textContent.trim() : '';
        document.dispatchEvent(new CustomEvent('view:country-selected', { detail: { name, item } }));
      });
    });
  }

  setupAnswerControls() {
    this.answerButtons = Array.from(document.querySelectorAll('.answer-option'));
    this.answerButtons.forEach((button, index) => {
      button.dataset.optionIndex = index.toString();
      button.addEventListener('click', (ev) => {
        const idx = Number(ev.currentTarget.dataset.optionIndex);
        document.dispatchEvent(new CustomEvent('view:answer-selected', { detail: { selectedIndex: idx } }));
      });
    });
  }

  setupNextButton() {
    this.nextQuestionButton = document.getElementById('nextQuestionBtn');
    if (this.nextQuestionButton) {
      this.nextQuestionButton.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('view:next-question'));
      });
    }
  }

  setupStartButton() {
    if (!this.startQuizButton) this.startQuizButton = document.getElementById('showOverlayBtn');
    if (this.startQuizButton) {
      this.startQuizButton.addEventListener('click', (ev) => {
        ev.preventDefault();
        document.dispatchEvent(new CustomEvent('view:start-quiz'));
      });
    }
  }

  // Update left-pane country list from pool array
  updateLeftPaneCountryList(pool) {
    const listItems = document.querySelectorAll('.item-list .country');
    listItems.forEach(item => { item.textContent = 'Waiting...'; delete item.dataset.countryCode; });
    pool.forEach((country, index) => {
      const listItem = listItems[index];
      if (!listItem || !country) return;
      listItem.textContent = country.name;
      if (country.code) listItem.dataset.countryCode = country.code;
    });
  }

  // Right pane helpers (ported from original script.js)
  setupRightPaneGameArea(countryName, gameType) {
    if (!this.rightPaneElement) this.rightPaneElement = document.querySelector('.right-pane');
    if (!this.rightPaneElement) return;
    this.rightPaneElement.classList.remove('hidden', 'disabled', 'transparent');
    this.rightPaneElement.setAttribute('aria-hidden', 'false');
    const quizBody = this.rightPaneElement.querySelector('.quiz__body');
    if (quizBody) { quizBody.classList.remove('hidden'); quizBody.setAttribute('aria-hidden', 'false'); }
    if (!this.questionElement) this.questionElement = this.rightPaneElement.querySelector('.row-1');
    const readableMode = this.capitalize(gameType);
    if (this.questionElement) {
      this.questionElement.textContent = `Quiz on ${readableMode}: ${countryName} is locked in. Press Start Quiz when you are ready.`;
      this.questionElement.classList.remove('hidden');
      this.questionElement.setAttribute('aria-hidden', 'false');
    }
    this.hideQuizRowsUntilStart();
    if (this.startQuizButton) {
      this.startQuizButton.classList.remove('hidden');
      this.startQuizButton.removeAttribute('disabled');
      this.startQuizButton.style.visibility = 'visible';
      this.startQuizButton.setAttribute('aria-hidden', 'false');
      this.startQuizButton.textContent = 'Start Quiz';
    }
    if (this.feedbackElement) { this.feedbackElement.textContent = ''; this.feedbackElement.classList.remove('feedback--correct','feedback--incorrect'); }
  }

  hideQuizRowsUntilStart() {
    if (!this.rightPaneElement) this.rightPaneElement = document.querySelector('.right-pane');
    if (!this.rightPaneElement) return;
    const rowsToHide = this.rightPaneElement.querySelectorAll('.row-2, .row-3, .row-4');
    rowsToHide.forEach(row => { row.classList.add('hidden'); row.setAttribute('aria-hidden', 'true'); });
    this.toggleAnswerButtons(true, true);
    if (this.nextQuestionButton) { this.nextQuestionButton.classList.add('hidden'); this.nextQuestionButton.disabled = true; this.nextQuestionButton.setAttribute('aria-hidden','true'); }
    if (this.feedbackElement) this.feedbackElement.textContent = '';
  }

  resetRightPaneBeforeQuiz() {
    if (!this.rightPaneElement) this.rightPaneElement = document.querySelector('.right-pane');
    if (!this.rightPaneElement) return;
    this.rightPaneElement.classList.add('hidden');
    this.rightPaneElement.setAttribute('aria-hidden', 'true');
    if (this.questionElement) this.questionElement.textContent = 'Select a country to get started.';
    this.hideQuizRowsUntilStart();
    if (this.startQuizButton) { this.startQuizButton.classList.add('hidden'); this.startQuizButton.setAttribute('aria-hidden','true'); }
  }

  updateStatusMessage(message, color) {
    if (!this.statusMessageElement) this.statusMessageElement = document.querySelector('.message-info-disabled');
    if (!this.statusMessageElement) return;
    this.statusMessageElement.textContent = message;
    if (color) this.statusMessageElement.style.color = color.trim();
  }

  capitalize(value) { if (!value || typeof value !== 'string') return ''; return value.charAt(0).toUpperCase() + value.slice(1); }

  getModeColor(mode) { if (!mode) return '#000'; const styles = getComputedStyle(document.documentElement); const value = styles.getPropertyValue(`--${mode}-color`); return value ? value.trim() : '#000'; }

  restoreStartButton() {
    if (!this.startQuizButton) this.startQuizButton = document.getElementById('showOverlayBtn');
    if (this.startQuizButton) {
      this.startQuizButton.classList.remove('hidden');
      this.startQuizButton.removeAttribute('disabled');
      this.startQuizButton.setAttribute('aria-hidden', 'false');
      this.startQuizButton.style.visibility = 'visible';
      this.startQuizButton.textContent = 'Start Quiz';
    }
  }

  // Disable interactive controls during an active quiz so the player can't change
  // the difficulty, switch modes, or pick a different country mid-quiz.
  disableGameControls() {
    // Difficulty selector
    const selector = document.getElementById('difficulty-select');
    if (selector) selector.disabled = true;

    // Mode buttons (population/currency/languages)
    const modeButtons = document.querySelectorAll('button[data-type]');
    modeButtons.forEach(btn => { btn.disabled = true; });

    // Left-pane country items
    const countries = document.querySelectorAll('.item-list .country');
    countries.forEach(item => {
      item.classList.add('disabled');
      item.style.pointerEvents = 'none';
      item.setAttribute('aria-disabled', 'true');
    });

    // Start button
    if (!this.startQuizButton) this.startQuizButton = document.getElementById('showOverlayBtn');
    if (this.startQuizButton) {
      // hide the Start button while the quiz is in progress
      this.startQuizButton.classList.add('hidden');
      this.startQuizButton.style.visibility = 'hidden';
      this.startQuizButton.disabled = true;
      this.startQuizButton.setAttribute('aria-disabled', 'true');
      this.startQuizButton.setAttribute('aria-hidden', 'true');
    }
  }

  // Re-enable the UI once the quiz is finished
  enableGameControls() {
    const selector = document.getElementById('difficulty-select');
    if (selector) selector.disabled = false;

    const modeButtons = document.querySelectorAll('button[data-type]');
    modeButtons.forEach(btn => { btn.disabled = false; });

    const countries = document.querySelectorAll('.item-list .country');
    countries.forEach(item => {
      item.classList.remove('disabled');
      item.style.pointerEvents = '';
      item.removeAttribute('aria-disabled');
    });

    if (!this.startQuizButton) this.startQuizButton = document.getElementById('showOverlayBtn');
    if (this.startQuizButton) {
      // show the Start button again when the quiz has finished
      this.startQuizButton.classList.remove('hidden');
      this.startQuizButton.style.visibility = '';
      this.startQuizButton.disabled = false;
      this.startQuizButton.removeAttribute('aria-disabled');
      this.startQuizButton.removeAttribute('aria-hidden');
    }
  }

  // Overlay UI
  showOverlay(message = 'Preparing questions...') {
    if (!this.rightPaneElement) this.rightPaneElement = document.querySelector('.right-pane');
    if (!this.rightPaneElement) return;
    if (!this.overlayElement) this.overlayElement = this.rightPaneElement.querySelector('.overlay');
    if (this.overlayElement) {
      this.overlayElement.classList.add('show');
      const msg = this.overlayElement.querySelector('.overlay-text');
      if (msg) msg.textContent = message;
    }
  }

  hideOverlay() {
    if (!this.rightPaneElement) this.rightPaneElement = document.querySelector('.right-pane');
    if (!this.rightPaneElement) return;
    if (!this.overlayElement) this.overlayElement = this.rightPaneElement.querySelector('.overlay');
    if (this.overlayElement) this.overlayElement.classList.remove('show');
  }

  // Show rows 2..4
  showQuizRows() {
    if (!this.rightPaneElement) return;
    const rowsToShow = this.rightPaneElement.querySelectorAll('.row-2, .row-3, .row-4');
    rowsToShow.forEach(row => { row.classList.remove('hidden'); row.setAttribute('aria-hidden','false'); });
  }

  renderQuestion(questionData, questionIndex, totalQuestions) {
    if (!questionData) { this.setFeedback('No question available', false); return; }
    const questionNumber = questionIndex + 1;
    if (this.questionElement) this.questionElement.textContent = `Question ${questionNumber} of ${totalQuestions}: ${questionData.question}`;
    this.answerButtons.forEach((button, index) => {
      const option = questionData.options[index];
      if (option) {
        button.textContent = option.label;
        button.dataset.optionIndex = index.toString();
        button.classList.remove('hidden','correct','incorrect','selected');
        button.disabled = false;
      } else {
        button.textContent = '';
        button.classList.add('hidden');
        button.disabled = true;
      }
    });
    if (this.feedbackElement) { this.feedbackElement.textContent = ''; this.feedbackElement.classList.remove('feedback--correct','feedback--incorrect'); }
    if (this.nextQuestionButton) {
      this.nextQuestionButton.classList.add('hidden');
      this.nextQuestionButton.disabled = true;
      this.nextQuestionButton.textContent = questionIndex === totalQuestions - 1 ? 'Finish Quiz' : 'Next Question';
      this.nextQuestionButton.setAttribute('aria-hidden','true');
    }
  }

  toggleAnswerButtons(disable, clearText) {
    this.answerButtons.forEach(button => {
      button.disabled = disable;
      button.classList.remove('correct','incorrect','selected');
      if (clearText) button.textContent = '';
    });
  }

  setFeedback(message, status) {
    if (!this.feedbackElement) return;
    this.feedbackElement.textContent = message;
    this.feedbackElement.classList.remove('feedback--correct','feedback--incorrect');
    if (status === true) this.feedbackElement.classList.add('feedback--correct');
    else if (status === false) this.feedbackElement.classList.add('feedback--incorrect');
  }

  // Score helpers that directly update simple DOM spans
  setScoreValue(elementId, value) { const el = document.getElementById(elementId); if (!el) return; el.textContent = String(value); }
  getScoreValue(elementId) { const el = document.getElementById(elementId); if (!el) return 0; const parsed = parseInt(el.textContent, 10); return Number.isNaN(parsed) ? 0 : parsed; }
  incrementScore() { const current = this.getScoreValue('score'); this.setScoreValue('score', current + 1); }
  incrementWrongAnswer() { const current = this.getScoreValue('incorrect'); this.setScoreValue('incorrect', current + 1); }

}

// Expose the QuizView constructor so Controller can create an instance
window.QuizView = QuizView;
