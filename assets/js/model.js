/**
 * model.js
 * QuizEngine (Model) - handles fetching country data, building the country pool
 * and generating question sets. Does NOT perform direct DOM updates: instead
 * it emits CustomEvents to notify the View/Controller when data changes.
 */

const REST_COUNTRIES_API_URL = 'https://restcountries.com/v3.1/all?fields=name,population,capital,cca3,region,languages,currencies,timezones,area,flags';
const REST_COUNTRIES_SAMPLE_SIZE = 10;

class QuizEngine {
  constructor() {
    this.countries = [];
    this.countryPool = [];
    this.score = 0;
    this.wrong = 0;
    this.streak = 0;
    this.questionNumber = 0;
    this.totalQuestions = 10;
    this.difficulty = 'easy';
    // Difficulty settings control how the pool is sampled and which countries are preferred
    this.difficultySettings = {
      easy: { countries: 30, popularOnly: true },
      medium: { countries: 100, popularOnly: false },
      hard: { countries: 200, popularOnly: false }
    };
  }

  // Initialize by loading countries and populating a pool
  async init() {
    try {
      await this.loadFromRestCountries();
      this.populateCountryPool();
      // Notify listeners that quiz is ready and pool is available
      document.dispatchEvent(new CustomEvent('quiz:ready', {
        detail: { loaded: this.countries ? this.countries.length : 0 }
      }));
      document.dispatchEvent(new CustomEvent('quiz:pool-updated', {
        detail: { pool: this.countryPool }
      }));
    } catch (err) {
      console.error('QuizEngine.init failed:', err);
      throw err;
    }
  }

  async loadFromRestCountries() {
    const response = await fetch(REST_COUNTRIES_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch countries: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    this.countries = data
      .filter(country => country?.name?.common && country.population)
      .map(country => ({
        name: country.name.common,
        code: country.cca3 || null,
        capital: Array.isArray(country.capital) && country.capital.length ? country.capital[0] : 'N/A',
        population: country.population || 0,
        area: country.area || 0,
        region: country.region || 'Unknown',
        languages: country.languages ? Object.values(country.languages) : [],
        currencies: country.currencies ? Object.values(country.currencies).map(c => c.name) : [],
        timezones: country.timezones || [],
        flag: country.flags?.png || country.flags?.svg || '',
        flagAlt: country.flags?.alt || `Flag of ${country.name?.common || 'country'}`,
        popularity: country.population || 0
      }));
  }

  populateCountryPool() {
    if (!Array.isArray(this.countries) || this.countries.length === 0) {
      this.countryPool = [];
      document.dispatchEvent(new CustomEvent('quiz:pool-updated', { detail: { pool: this.countryPool } }));
      return;
    }

    const settings = this.difficultySettings[this.difficulty] || this.difficultySettings.easy;

    let candidateList = [];
    if (settings.popularOnly) {
      // prefer high-popularity countries for easy mode
      candidateList = [...this.countries].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, settings.countries);
    } else {
      // use a shuffled subset for medium/hard
      candidateList = this.shuffleArray(this.countries).slice(0, Math.min(settings.countries, this.countries.length));
    }

    // From the candidate list, pick REST_COUNTRIES_SAMPLE_SIZE random entries to show in the left pane
    const pool = this.shuffleArray(candidateList).slice(0, REST_COUNTRIES_SAMPLE_SIZE);
    this.countryPool = pool;

    // Emit an event so the View can re-render left-pane without the Model touching the DOM
    document.dispatchEvent(new CustomEvent('quiz:pool-updated', { detail: { pool: this.countryPool } }));
  }

  /**
   * Set difficulty level and refresh the country pool. Valid levels: 'easy','medium','hard'
   */
  /**
   * Set difficulty level.
   * @param {string} level - 'easy'|'medium'|'hard'
   * @param {boolean} [reload=true] - whether to repopulate the visible country pool immediately.
   * When false, only the difficulty value is updated (no left-pane reload). This is useful when the
   * UI wants to change difficulty without disrupting the currently displayed countries.
   */
  setDifficulty(level, reload = true) {
    if (!level || !this.difficultySettings[level]) return;
    this.difficulty = level;
    if (reload) {
      // Rebuild pool with the new difficulty and emit pool-updated
      this.populateCountryPool();
    }
    // Notify listeners that difficulty changed (UI can sync selector)
    document.dispatchEvent(new CustomEvent('quiz:difficulty-changed', { detail: { difficulty: this.difficulty } }));
  }

  getDifficulty() {
    return this.difficulty;
  }

  // Utility methods and question generation (kept from original engine)
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  uniqueByName(countries) {
    const seen = new Set();
    return countries.filter(country => {
      if (!country || !country.name) return false;
      if (seen.has(country.name)) return false;
      seen.add(country.name);
      return true;
    });
  }

  hasDataForType(country, type) {
    if (!country) return false;
    switch (type) {
      case 'population':
        return Number.isFinite(country.population) && country.population > 0;
      case 'currency':
        return Array.isArray(country.currencies) && country.currencies.length > 0 && Boolean(country.currencies[0]);
      case 'languages':
        return Array.isArray(country.languages) && country.languages.length > 0 && Boolean(country.languages[0]);
      default:
        return false;
    }
  }

  getCountriesForType(type, desiredCount) {
    const basePool = this.countryPool.length ? [...this.countryPool] : this.shuffleArray(this.countries).slice(0, Math.max(desiredCount || REST_COUNTRIES_SAMPLE_SIZE, REST_COUNTRIES_SAMPLE_SIZE));
    const filteredBase = basePool.filter(country => this.hasDataForType(country, type));
    if (filteredBase.length > 0) return this.uniqueByName(filteredBase);
    const extended = this.countries.filter(country => this.hasDataForType(country, type));
    return this.uniqueByName([...filteredBase, ...extended]);
  }

  collectUniqueValues(pool, key, excludeCountryName) {
    const seen = new Set();
    const values = [];
    pool.forEach(country => {
      if (!country || country.name === excludeCountryName) return;
      const items = Array.isArray(country[key]) ? country[key] : [];
      items.forEach(item => {
        if (!item || seen.has(item)) return;
        seen.add(item);
        values.push(item);
      });
    });
    return values;
  }

  generateQuestionSet(type, desiredCount = REST_COUNTRIES_SAMPLE_SIZE) {
    const availableCountries = this.getCountriesForType(type, desiredCount);
    if (!Array.isArray(availableCountries) || availableCountries.length === 0) return [];
    const shuffledAvailable = this.shuffleArray(availableCountries);
    const optionPool = this.uniqueByName([...availableCountries, ...this.countries]);
    const questions = [];
    const tried = new Set();
    for (let i = 0; i < shuffledAvailable.length && questions.length < desiredCount; i++) {
      const country = shuffledAvailable[i];
      if (!country || tried.has(country.name)) continue;
      tried.add(country.name);
      const q = this.buildQuestionForType(type, country, optionPool);
      if (q) questions.push(q);
    }
    if (questions.length < desiredCount) {
      const fallbackPool = this.shuffleArray(this.countries).filter(c => !tried.has(c.name));
      for (let i = 0; i < fallbackPool.length && questions.length < desiredCount; i++) {
        const country = fallbackPool[i];
        if (!this.hasDataForType(country, type)) continue;
        const q = this.buildQuestionForType(type, country, optionPool);
        if (q) {
          questions.push(q);
          tried.add(country.name);
        }
      }
    }
    return questions.slice(0, desiredCount);
  }

  buildQuestionForType(type, country, pool) {
    switch (type) {
      case 'population':
        return this.buildPopulationQuestion(country, pool);
      case 'currency':
        return this.buildCurrencyQuestion(country, pool);
      case 'languages':
        return this.buildLanguagesQuestion(country, pool);
      default:
        return null;
    }
  }

  buildPopulationQuestion(country, pool) {
    if (!this.hasDataForType(country, 'population')) return null;
    const correctValue = country.population;
    const rawOptions = this.generatePopulationOptions(correctValue, pool, country.name);
    const uniqueOptions = Array.from(new Set(rawOptions)).slice(0, 4);
    if (!uniqueOptions.includes(correctValue) || uniqueOptions.length < 4) return null;
    const optionObjects = uniqueOptions.map(value => ({ label: this.formatPopulation(value), value }));
    const shuffledOptions = this.shuffleArray(optionObjects);
    const correctIndex = shuffledOptions.findIndex(option => option.value === correctValue);
    if (correctIndex === -1) return null;
    return {
      type: 'population',
      country: country.name,
      question: `What is the population of ${country.name}?`,
      options: shuffledOptions,
      correctIndex,
      correctAnswerLabel: this.formatPopulation(correctValue),
      explanation: `${country.name} has a population of about ${this.formatPopulation(correctValue)}.`
    };
  }

  generatePopulationOptions(correctValue, pool, countryName) {
    const candidates = pool.filter(item => item.name !== countryName && this.hasDataForType(item, 'population')).map(item => item.population);
    const uniqueCandidates = Array.from(new Set(candidates));
    const distractors = [];
    while (uniqueCandidates.length > 0 && distractors.length < 3) {
      const index = Math.floor(Math.random() * uniqueCandidates.length);
      const candidate = uniqueCandidates.splice(index, 1)[0];
      if (candidate !== correctValue) distractors.push(candidate);
    }
    const fallbackMultipliers = [0.55, 0.75, 1.2, 1.4, 1.8];
    let multiplierIndex = 0;
    while (distractors.length < 3) {
      const multiplier = fallbackMultipliers[multiplierIndex % fallbackMultipliers.length];
      multiplierIndex += 1;
      const candidate = Math.max(100000, Math.round(correctValue * multiplier));
      if (![correctValue, ...distractors].includes(candidate)) distractors.push(candidate);
    }
    return [correctValue, ...distractors];
  }

  formatPopulation(value) {
    if (!Number.isFinite(value)) return 'Unknown population';
    return `${value.toLocaleString()} people`;
  }

  buildCurrencyQuestion(country, pool) {
    if (!this.hasDataForType(country, 'currency')) return null;
    const correctCurrency = country.currencies[0];
    const optionLabels = this.generateCurrencyOptions(correctCurrency, pool, country.name);
    const uniqueOptions = optionLabels.filter((label, index, array) => Boolean(label) && array.indexOf(label) === index);
    if (!uniqueOptions.includes(correctCurrency) || uniqueOptions.length < 4) return null;
    const optionObjects = uniqueOptions.slice(0, 4).map(label => ({ label, value: label }));
    const shuffledOptions = this.shuffleArray(optionObjects);
    const correctIndex = shuffledOptions.findIndex(option => option.value === correctCurrency);
    if (correctIndex === -1) return null;
    return {
      type: 'currency',
      country: country.name,
      question: `Which currency is used in ${country.name}?`,
      options: shuffledOptions,
      correctIndex,
      correctAnswerLabel: correctCurrency,
      explanation: `${country.name} uses the ${correctCurrency}.`
    };
  }

  generateCurrencyOptions(correctCurrency, pool, countryName) {
    const candidates = this.collectUniqueValues(pool, 'currencies', countryName).filter(currency => currency !== correctCurrency);
    const distractors = [];
    while (candidates.length > 0 && distractors.length < 3) {
      const index = Math.floor(Math.random() * candidates.length);
      const candidate = candidates.splice(index, 1)[0];
      if (!distractors.includes(candidate)) distractors.push(candidate);
    }
    const fallbackCurrencies = ['Euro', 'United States dollar', 'Yen', 'Pound sterling', 'Rupee'];
    for (const currency of fallbackCurrencies) {
      if (distractors.length >= 3) break;
      if (currency !== correctCurrency && !distractors.includes(currency)) distractors.push(currency);
    }
    return [correctCurrency, ...distractors].slice(0, 4);
  }

  buildLanguagesQuestion(country, pool) {
    if (!this.hasDataForType(country, 'languages')) return null;
    const correctLanguage = country.languages[0];
    const optionLabels = this.generateLanguageOptions(correctLanguage, pool, country.name);
    const uniqueOptions = optionLabels.filter((label, index, array) => Boolean(label) && array.indexOf(label) === index);
    if (!uniqueOptions.includes(correctLanguage) || uniqueOptions.length < 4) return null;
    const optionObjects = uniqueOptions.slice(0, 4).map(label => ({ label, value: label }));
    const shuffledOptions = this.shuffleArray(optionObjects);
    const correctIndex = shuffledOptions.findIndex(option => option.value === correctLanguage);
    if (correctIndex === -1) return null;
    return {
      type: 'languages',
      country: country.name,
      question: `Which language is spoken in ${country.name}?`,
      options: shuffledOptions,
      correctIndex,
      correctAnswerLabel: correctLanguage,
      explanation: `${correctLanguage} is spoken in ${country.name}.`
    };
  }

  generateLanguageOptions(correctLanguage, pool, countryName) {
    const candidates = this.collectUniqueValues(pool, 'languages', countryName).filter(language => language !== correctLanguage);
    const distractors = [];
    while (candidates.length > 0 && distractors.length < 3) {
      const index = Math.floor(Math.random() * candidates.length);
      const candidate = candidates.splice(index, 1)[0];
      if (!distractors.includes(candidate)) distractors.push(candidate);
    }
    const fallbackLanguages = ['English', 'Spanish', 'French', 'Arabic', 'Hindi', 'Portuguese', 'Russian', 'Chinese'];
    for (const language of fallbackLanguages) {
      if (distractors.length >= 3) break;
      if (language !== correctLanguage && !distractors.includes(language)) distractors.push(language);
    }
    return [correctLanguage, ...distractors].slice(0, 4);
  }

} // end QuizEngine

const quiz = new QuizEngine();
window.quiz = quiz;
window.QuizEngine = QuizEngine;

quiz.init().then(() => {
  console.log('QuizEngine initialized — model ready.');
}).catch(err => {
  console.error('QuizEngine init error:', err);
});
