/**
 * Bengali Language Detection Fix
 *
 * Simple Bengali-specific patterns to improve detection accuracy
 */

// Bengali-specific words that should trigger Bengali detection
const bengaliSpecificWords = [
    'kemon', 'ache', 'aaj', 'thik', 'kora', 'kotha', 'kal', 'am', 'tumi', 'apni', 'tomar', 'bhalo', 'shuno', 'kona',
    'baad', 'bap', 'kache', 'gaye', 'shona', 'shikha', 'montri', 'shopna',
    'ki', 'ar', 'kar', 'koro', 'korbe', 'korche', 'korcho', 'korle', 'dorkar',
    'laptop', 'komputar', 'code', 'kaj', 'kora', 'ghor', 'shotti', 'sotti',
    'din', 'rat', 'kalbo', 'bai', 'mone', 'taaka', 'shikal', 'jodi'
];

// Bengali character patterns (more specific than generic Indic)
const bengaliPatterns = [
    // Bengali-specific patterns
    /[আজতোমা]/,  // Combined vowel with 'vowel'
    /[তোমা]/g,  // Common vowel
    /[তোমা]r/,  // Retroflex R
    /[তোমা]y/,  // Yer suffix
    /k[তোমা]t/,  // Retroflex T
    /[তোমা]m/,  // Retroflex M
    /[তোমা]b/,  // Retroflex B
    /চ[তোমা]/,  // Retroflex B + ha
    /[তোমা]n/,  // Nasal consonants
    /[তোমা]y/,  // Palatal - similar to Bengali
    /[তোমা]p/,  // Retroflex P + ha (common)
    /sh/, /ch/, /th/, /bh/, /dh/, /ph/,
    // Common consonant clusters
    /kh[তোমা]g/,  // Retroflex KH
    /[তোমা]sh[তোমা]/,  // Retroflex SH + ha
    /[তোমা]d[তোমা]h/,  // Retroflex DH + ha
    /[তোমা]n[তোমা]b[তোমা]/,  // Retroflex N
    /[তোমা]r/,  // Retroflex R
    /[তোমা]s/,  // Retroflex S
    /[তোমা]sh/,  // Retroflex SH
    // Common Bengali endings
    /[তোমা]ba/,  // Retroflex B (verb root)
    /[তোমা]bo/,  // Retroflex N (verb root)
    /[তোমা]ti/,  // Retroflex T (retroflex T) root
    // Common Bengali question words
    /kya/, /ki/, /kemon/, /kotha/, /kora/, /kal/, /am/, /tumi/, /apni/, /kon/,
    // Common Bengali honorifics
    /shree/, /guru/, /mahan/, /sadhu/, /pranam/, /
];

function detectBengaliText(text) {
    const lowerText = text.toLowerCase();

    // Count Bengali-specific words
    let bengaliWordCount = 0;
    bengaliSpecificWords.forEach(word => {
        if (lowerText.includes(word.toLowerCase())) {
            bengaliWordCount++;
        }
    });

    // If significant Bengali words (> 5% of text), classify as Bengali
    const bengaliRatio = bengaliWordCount / text.length;

    console.log(`[Bengali] Word count: ${bengaliWordCount}, Ratio: ${(bengaliRatio * 100).toFixed(1)}%`);

    return {
        language: 'bn',
        confidence: Math.min(0.95, bengaliRatio * 100), // Boost confidence if Bengali words present
        method: 'bengali_specific_words'
        details: `Detected ${bengaliWordCount} Bengali-specific words (${(bengaliRatio * 100)}% of text)`
    };
}

module.exports = { detectBengaliText };
