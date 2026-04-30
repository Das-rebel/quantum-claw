/**
 * Bengali Language Detector - Dedicated High-Precision Detection
 *
 * Solution 3 from SARVAM_FIX_STRATEGY.md
 * - Uses Bengali-specific patterns only (no ensemble voting)
 * - Simpler logic flow (pattern matching → confidence)
 * - Direct integration to translation provider
 */

class BengaliDetector {
  constructor() {
    // Bengali Unicode range: U+0980–U+09FF
    this.bengaliScriptPattern = /[\u0980-\u09FF]/;

    // Bengali-specific words (transliterated + native script)
    this.bengaliSpecificWords = new Set([
      // Common greetings & honorifics
      'kemon', 'ache', 'aaj', 'tomar', 'tumi', 'apni', 'bhai', 'bon',
      'kotha', 'kona', 'ki', 'kache', 'shono', 'shona', 'bhalo', 'bap',

      // Common verbs & actions
      'kora', 'korbe', 'korche', 'korcho', 'korle', 'dorkar', 'thak',
      'hoy', 'hobe', 'hochche', 'hocche', 'thik', 'shotti', 'sotti',

      // Common words & expressions
      'ki', 'ar', 'kar', 'baad', 'kache', 'gaye', 'shikha', 'montri',
      'shopna', 'din', 'rat', 'kal', 'bai', 'mone', 'taaka', 'shikal',
      'jodi', 'tahole', 'kintu', 'tobe', 'shobar', 'sob', 'sobkichu',

      // Technology & work terms
      'laptop', 'komputar', 'code', 'kaj', 'kora', 'ghor', 'shikha',
      'kotha', 'shona', 'bhalo', 'shotti', 'sotti',

      // Question words
      'ki', 'kemon', 'kothay', 'keno', 'kibhabe', 'kokhon', 'kake',

      // Bengali-specific word endings
      'ache', 'thake', 'hobe', 'korbo', 'kore', 'debe', 'jabe', 'parbe'
    ]);

    // Bengali honorifics & formal address
    this.bengaliHonorifics = new Set([
      'shree', 'guru', 'mahan', 'sadhu', 'pranam', 'namaskar', 'namaskar'
    ]);

    // Bengali question words (very specific to Bengali)
    this.bengaliQuestionWords = new Set([
      'ki', 'kemon', 'kothay', 'kake', 'kibhabe', 'keno', 'kokhon'
    ]);

    // Bengali vowel patterns (in transliteration)
    this.bengaliVowelPatterns = [
      /k[aeiou]/i,  // ka, ke, ki, ko, ku
      /t[aeiou]/i,  // ta, te, ti, to, tu
      /n[aeiou]/i,  // na, ne, ni, no, nu
      /sh[aeiou]/i, // sha, she, shi, sho, shu
      /th[aeiou]/i, // tha, the, thi, tho, thu
      /bh[aeiou]/i, // bha, bhe, bhi, bho, bhu
      /dh[aeiou]/i, // dha, dhe, dhi, dho, dhu
      /ph[aeiou]/i // pha, phe, phi, pho, phu
    ];

    // Bengali consonant clusters (characteristic of Bengali)
    this.bengaliConsonantClusters = [
      /kh[a-z]/i, /gh[a-z]/i, /jh[a-z]/i,
      /ch[a-z]/i, /chh[a-z]/i,
      /th[a-z]/i, /dh[a-z]/i, /ph[a-z]/i, /bh[a-z]/i,
      /sh[a-z]/i, /ng[a-z]/i, /ny[a-z]/i
    ];

    // Bengali-specific word endings (more specific to avoid English false positives)
    this.bengaliEndings = new Set([
      'che', 'be', 'bo', 'te', 'ti', 'ni', 'di', 'chi', 'cho', 'ri', 'lo'
    ]);

    // Common English words that should NOT trigger Bengali detection (false positive filter)
    this.englishStopWords = new Set([
      'hello', 'how', 'are', 'you', 'what', 'is', 'the', 'weather', 'doing',
      'good', 'morning', 'evening', 'night', 'thanks', 'please', 'sorry',
      'yes', 'no', 'okay', 'alright', 'fine', 'well', 'great'
    ]);

    // Common Hinglish words that should NOT trigger Bengali detection
    // These are Hindi words transliterated to Latin script, often confused with Bengali
    this.hinglishStopWords = new Set([
      // Common Hinglish question words
      'kya', 'kaisa', 'kaise', 'kahan', 'kab', 'kidhar', 'kaun', 'kyun', 'kyon',
      'kitna', 'kitne', 'kitni', 'kiska', 'kisne', 'kisliye', 'kissey',

      // Common Hinglish verbs and actions
      'hai', 'ho', 'hain', 'tha', 'thi', 'the',
      'karo', 'karna', 'batao', 'batana', 'bolo', 'bolna',
      'karo', 'suno', 'sunna', 'lena', 'dena',

      // Common Hinglish expressions
      'acha', 'achha', 'theek', 'thik', 'sahi', 'bilkul',
      'namaste', 'shukriya', 'dhanyavad', 'maaf', 'sorry',

      // Common Hinglish pronouns and addresses
      'yaar', 'bhai', 'arre', 'arrey', 'arey',
      'tum', 'tumhara', 'mere', 'mera', 'apka', 'humara',

      // Common Hinglish connectors
      'aur', 'ya', 'par', 'to', 'phir', 'lekin',
      'ki', 'ka', 'ke', 'ko', 'se', 'mein', 'me',

      // Common Hinglish adjectives
      'bada', 'chota', 'mota', 'patla', 'lamba',
      'naya', 'purana', 'saf', 'ganda', 'accha', 'bura',

      // Numbers in Hinglish
      'ek', 'do', 'teen', 'char', 'paanch', 'chhe', 'saat',
      'aath', 'nau', 'das', 'hazar',

      // Common Hinglish direction words
      'yaha', 'yahan', 'waha', 'wahan', 'idhar', 'udhar',
      'upar', 'neeche', 'baad', 'pahle', 'abhi'
    ]);
  }

  /**
     * Detect Bengali text with high precision
     * @param {string} text - Text to analyze
     * @returns {object} Detection result with language, confidence, and details
     */
  detect(text) {
    if (!text || typeof text !== 'string') {
      return { language: 'unknown', confidence: 0, method: 'none' };
    }

    const lowerText = text.toLowerCase().trim();
    const words = lowerText.split(/\s+/).filter(w => w.length > 0);

    if (words.length === 0) {
      return { language: 'unknown', confidence: 0, method: 'empty' };
    }

    // Check 1: Native Bengali script (highest confidence)
    const hasNativeScript = this.bengaliScriptPattern.test(text);

    // Check 2: Count Bengali-specific words
    let bengaliWordCount = 0;
    let bengaliHonorificCount = 0;
    let questionWordCount = 0;

    words.forEach(word => {
      // Remove punctuation
      const cleanWord = word.replace(/[.,!?;:'"()-]/g, '');

      if (this.bengaliSpecificWords.has(cleanWord)) {
        bengaliWordCount++;
      }
      if (this.bengaliHonorifics.has(cleanWord)) {
        bengaliHonorificCount++;
      }
      if (this.bengaliQuestionWords.has(cleanWord)) {
        questionWordCount++;
      }
    });

    // Check 3: Bengali vowel patterns
    let vowelPatternMatches = 0;
    this.bengaliVowelPatterns.forEach(pattern => {
      if (pattern.test(lowerText)) {
        vowelPatternMatches++;
      }
    });

    // Check 4: Bengali consonant clusters
    let consonantClusterMatches = 0;
    this.bengaliConsonantClusters.forEach(pattern => {
      if (pattern.test(lowerText)) {
        consonantClusterMatches++;
      }
    });

    // Check 5: Bengali word endings (with English false positive filter)
    let endingMatches = 0;
    let englishStopWordCount = 0;
    let hinglishStopWordCount = 0;

    words.forEach(word => {
      const cleanWord = word.replace(/[.,!?;:'"()-]/g, '');

      // Check if this is an English stop word (false positive prevention)
      if (this.englishStopWords.has(cleanWord.toLowerCase())) {
        englishStopWordCount++;
      }

      // Check if this is a Hinglish stop word (false positive prevention)
      if (this.hinglishStopWords.has(cleanWord.toLowerCase())) {
        hinglishStopWordCount++;
      }

      this.bengaliEndings.forEach(ending => {
        if (cleanWord.endsWith(ending)) {
          endingMatches++;
        }
      });
    });

    // Calculate Bengali ratio
    const bengaliRatio = bengaliWordCount / words.length;

    // Confidence scoring
    let confidence = 0;
    let confidenceDetails = [];

    // Native script gets very high confidence
    if (hasNativeScript) {
      confidence += 0.6; // Increased from 0.5 to 0.6
      confidenceDetails.push('native_script');
    }

    // Bengali-specific words (strong indicator) - BOOSTED weights
    if (bengaliRatio >= 0.15) {
      confidence += 0.45; // Boosted from 0.35 to 0.45
      confidenceDetails.push('bengali_words_15%');
    } else if (bengaliRatio >= 0.1) {
      confidence += 0.35; // Boosted from 0.25 to 0.35
      confidenceDetails.push('bengali_words_10%');
    } else if (bengaliRatio >= 0.05) {
      confidence += 0.25; // Boosted from 0.15 to 0.25
      confidenceDetails.push('bengali_words_5%');
    }

    // Honorifics (formal Bengali) - BOOSTED
    if (bengaliHonorificCount > 0) {
      confidence += 0.15; // Boosted from 0.1 to 0.15
      confidenceDetails.push('honorifics');
    }

    // Question words (Bengali-specific) - BOOSTED
    if (questionWordCount > 0) {
      confidence += 0.15; // Boosted from 0.1 to 0.15
      confidenceDetails.push('question_words');
    }

    // Vowel patterns - BOOSTED and lowered threshold
    if (vowelPatternMatches >= 1) {
      confidence += 0.1; // Boosted from 0.05 to 0.1, lowered threshold from 3 to 1
      confidenceDetails.push('vowel_patterns');
    }

    // Consonant clusters - BOOSTED and lowered threshold
    if (consonantClusterMatches >= 1) {
      confidence += 0.1; // Boosted from 0.05 to 0.1, lowered threshold from 2 to 1
      confidenceDetails.push('consonant_clusters');
    }

    // Word endings - BOOSTED and lowered threshold
    if (endingMatches >= 1) {
      confidence += 0.1; // Boosted from 0.05 to 0.1, lowered threshold from 2 to 1
      confidenceDetails.push('word_endings');
    }

    // English stop words (false positive penalty)
    if (englishStopWordCount > 0) {
      const stopWordRatio = englishStopWordCount / words.length;
      if (stopWordRatio >= 0.5) {
        confidence -= 0.4; // Heavy penalty for mostly English
        confidenceDetails.push('english_stop_words_penalty');
      } else if (stopWordRatio >= 0.25) {
        confidence -= 0.2; // Moderate penalty for mixed
        confidenceDetails.push('english_stop_words_penalty');
      }
    }

    // Hinglish stop words (false positive penalty - CRITICAL FIX)
    // Hinglish words like "kaisa", "hai", "kya" should NOT trigger Bengali detection
    if (hinglishStopWordCount > 0) {
      const hinglishRatio = hinglishStopWordCount / words.length;
      if (hinglishRatio >= 0.3) {
        confidence -= 0.5; // Heavy penalty for Hinglish (stronger than English)
        confidenceDetails.push('hinglish_stop_words_penalty');
      } else if (hinglishRatio >= 0.15) {
        confidence -= 0.3; // Moderate penalty for mixed Hinglish
        confidenceDetails.push('hinglish_stop_words_penalty');
      } else if (hinglishRatio >= 0.1) {
        confidence -= 0.15; // Light penalty for some Hinglish words
        confidenceDetails.push('hinglish_stop_words_penalty');
      }
    }

    // Cap confidence at 0.99
    confidence = Math.min(0.99, confidence);

    // Decision: Bengali or English
    // Adjusted confidence threshold for better detection
    // 0.5 is the sweet spot for Bengali detection
    const isBengali = confidence >= 0.5;

    // Logging for debugging
    console.log(`[BengaliDetector] Analysis:
  - Words: ${words.length}
  - Bengali words: ${bengaliWordCount} (${(bengaliRatio * 100).toFixed(1)}%)
  - Native script: ${hasNativeScript}
  - Honorifics: ${bengaliHonorificCount}
  - Question words: ${questionWordCount}
  - Vowel patterns: ${vowelPatternMatches}
  - Consonant clusters: ${consonantClusterMatches}
  - Word endings: ${endingMatches}
  - English stop words: ${englishStopWordCount}
  - Hinglish stop words: ${hinglishStopWordCount}
  - Confidence: ${(confidence * 100).toFixed(1)}%
  - Confidence details: ${confidenceDetails.join(', ')}
  - Result: ${isBengali ? 'BENGALI' : 'ENGLISH/OTHER'}`);

    return {
      language: isBengali ? 'bn' : 'en',
      confidence: confidence,
      method: 'bengali_specific_detector',
      details: {
        bengaliWordCount,
        bengaliRatio: (bengaliRatio * 100).toFixed(1) + '%',
        hasNativeScript,
        bengaliHonorificCount,
        questionWordCount,
        vowelPatternMatches,
        consonantClusterMatches,
        endingMatches,
        confidenceDetails
      }
    };
  }

  /**
     * Quick detection for performance-critical paths
     * @param {string} text - Text to analyze
     * @returns {string} 'bn' or 'en'
     */
  detectQuick(text) {
    if (!text || typeof text !== 'string') {
      return 'en';
    }

    const result = this.detect(text);
    return result.language === 'bn' ? 'bn' : 'en';
  }

  /**
     * Health check - verify detector is working
     */
  healthCheck() {
    const testCases = [
      { text: 'kemon ache aaj', expected: 'bn' },
      { text: 'weather kaisa hai', expected: 'en' }, // Hinglish
      { text: 'নমস্কার', expected: 'bn' }, // Native script
      { text: 'hello how are you', expected: 'en' }
    ];

    const results = testCases.map(test => {
      const result = this.detectQuick(test.text);
      const passed = result === test.expected;
      return { test: test.text, expected: test.expected, actual: result, passed };
    });

    const allPassed = results.every(r => r.passed);

    console.log('[BengaliDetector] Health check:', allPassed ? 'PASS' : 'FAIL');
    results.forEach(r => {
      console.log(`  ${r.test}: ${r.passed ? '✓' : '✗'} (expected: ${r.expected}, got: ${r.actual})`);
    });

    return { healthy: allPassed, results };
  }
}

module.exports = BengaliDetector;
