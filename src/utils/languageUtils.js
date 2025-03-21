const fs = require('fs');
const path = require('path');

class LanguageManager {
  constructor() {
    this.languages = {};
    this.defaultLanguage = 'en';
    this.loadLanguages();
  }

  loadLanguages() {
    const localesPath = path.join(__dirname, '..', 'locales');
    const files = fs.readdirSync(localesPath);

    for (const file of files) {
      if (file.endsWith('.json')) {
        const languageCode = file.replace('.json', '');
        const content = fs.readFileSync(path.join(localesPath, file), 'utf-8');
        this.languages[languageCode] = JSON.parse(content);
      }
    }
  }

  translate(key, language = this.defaultLanguage, params = {}) {
    const lang = this.languages[language] || this.languages[this.defaultLanguage];
    const keys = key.split('.');
    let value = lang;

    for (const k of keys) {
      value = value?.[k];
      if (!value) break;
    }

    if (typeof value !== 'string') {
      value = this.getFromDefaultLanguage(key);
    }

    return this.replaceParams(value || key, params);
  }

  getFromDefaultLanguage(key) {
    const keys = key.split('.');
    let value = this.languages[this.defaultLanguage];

    for (const k of keys) {
      value = value?.[k];
      if (!value) break;
    }

    return value;
  }

  replaceParams(text, params) {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }
}

module.exports = new LanguageManager();
