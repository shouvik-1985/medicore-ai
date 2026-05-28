export type AnalyzerAudience = "doctor" | "patient";

export interface AnalyzerLanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  keyboardLayout: string | null;
}

export type AnalyzerUiCopy = Record<string, string>;

export const ANALYZER_LANGUAGE_OPTIONS: AnalyzerLanguageOption[] = [
  { code: "en", label: "English", nativeLabel: "English", keyboardLayout: null },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", keyboardLayout: "devanagari" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", keyboardLayout: "bengali" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", keyboardLayout: "devanagari" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", keyboardLayout: "tamil" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", keyboardLayout: "telugu" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", keyboardLayout: "gujarati" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", keyboardLayout: "kannada" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", keyboardLayout: "malayalam" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", keyboardLayout: "gurmukhi" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", keyboardLayout: "urdu" },
];

const KEYBOARD_LAYOUTS: Record<string, string[][]> = {
  devanagari: [
    ["अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ", "ओ", "औ", "ऋ", "अं"],
    ["क", "ख", "ग", "घ", "च", "छ", "ज", "झ", "ट", "ठ", "ड", "ढ"],
    ["त", "थ", "द", "ध", "न", "प", "फ", "ब", "भ", "म", "य", "र"],
    ["ल", "व", "श", "ष", "स", "ह", "ा", "ि", "ी", "ु", "ू", "े", "ै", "ो", "ौ", "्", "ं", "ः"],
  ],
  bengali: [
    ["অ", "আ", "ই", "ঈ", "উ", "ঊ", "এ", "ঐ", "ও", "ঔ", "ঋ", "ং"],
    ["ক", "খ", "গ", "ঘ", "চ", "ছ", "জ", "ঝ", "ট", "ঠ", "ড", "ঢ"],
    ["ত", "থ", "দ", "ধ", "ন", "প", "ফ", "ব", "ভ", "ম", "য", "র"],
    ["ল", "শ", "ষ", "স", "হ", "া", "ি", "ী", "ু", "ূ", "ে", "ৈ", "ো", "ৌ", "্", "ং", "ঃ"],
  ],
  tamil: [
    ["அ", "ஆ", "இ", "ஈ", "உ", "ஊ", "எ", "ஏ", "ஐ", "ஒ", "ஓ", "ஔ"],
    ["க", "ங", "ச", "ஜ", "ஞ", "ட", "ண", "த", "ந", "ப", "ம"],
    ["ய", "ர", "ல", "வ", "ழ", "ள", "ற", "ன", "ஹ", "ஷ", "ஸ"],
    ["ா", "ி", "ீ", "ு", "ூ", "ெ", "ே", "ை", "ொ", "ோ", "ௌ", "்", "ம்"],
  ],
  telugu: [
    ["అ", "ఆ", "ఇ", "ఈ", "ఉ", "ఊ", "ఎ", "ఏ", "ఐ", "ఒ", "ఓ", "ఔ"],
    ["క", "ఖ", "గ", "ఘ", "చ", "ఛ", "జ", "ఝ", "ట", "ఠ", "డ", "ఢ"],
    ["త", "థ", "ద", "ధ", "న", "ప", "ఫ", "బ", "భ", "మ", "య", "ర"],
    ["ల", "వ", "శ", "ష", "స", "హ", "ా", "ి", "ీ", "ు", "ూ", "ె", "ే", "ై", "ొ", "ో", "ౌ", "్", "ం"],
  ],
  gujarati: [
    ["અ", "આ", "ઇ", "ઈ", "ઉ", "ઊ", "એ", "ઐ", "ઓ", "ઔ", "ઋ", "ં"],
    ["ક", "ખ", "ગ", "ઘ", "ચ", "છ", "જ", "ઝ", "ટ", "ઠ", "ડ", "ઢ"],
    ["ત", "થ", "દ", "ધ", "ન", "પ", "ફ", "બ", "ભ", "મ", "ય", "ર"],
    ["લ", "વ", "શ", "ષ", "સ", "હ", "ા", "િ", "ી", "ુ", "ૂ", "ે", "ૈ", "ો", "ૌ", "્", "ં", "ઃ"],
  ],
  kannada: [
    ["ಅ", "ಆ", "ಇ", "ಈ", "ಉ", "ಊ", "ಎ", "ಏ", "ಐ", "ಒ", "ಓ", "ಔ"],
    ["ಕ", "ಖ", "ಗ", "ಘ", "ಚ", "ಛ", "ಜ", "ಝ", "ಟ", "ಠ", "ಡ", "ಢ"],
    ["ತ", "ಥ", "ದ", "ಧ", "ನ", "ಪ", "ಫ", "ಬ", "ಭ", "ಮ", "ಯ", "ರ"],
    ["ಲ", "ವ", "ಶ", "ಷ", "ಸ", "ಹ", "ಾ", "ಿ", "ೀ", "ು", "ೂ", "ೆ", "ೇ", "ೈ", "ೊ", "ೋ", "ೌ", "್", "ಂ"],
  ],
  malayalam: [
    ["അ", "ആ", "ഇ", "ഈ", "ഉ", "ഊ", "എ", "ഏ", "ഐ", "ഒ", "ഓ", "ഔ"],
    ["ക", "ഖ", "ഗ", "ഘ", "ച", "ഛ", "ജ", "ഝ", "ട", "ഠ", "ഡ", "ഢ"],
    ["ത", "ഥ", "ദ", "ധ", "ന", "പ", "ഫ", "ബ", "ഭ", "മ", "യ", "ര"],
    ["ല", "വ", "ശ", "ഷ", "സ", "ഹ", "ാ", "ി", "ീ", "ു", "ൂ", "െ", "േ", "ൈ", "ൊ", "ോ", "ൗ", "്", "ം"],
  ],
  gurmukhi: [
    ["ਅ", "ਆ", "ਇ", "ਈ", "ਉ", "ਊ", "ਏ", "ਐ", "ਓ", "ਔ", "਋", "ਂ"],
    ["ਕ", "ਖ", "ਗ", "ਘ", "ਚ", "ਛ", "ਜ", "ਝ", "ਟ", "ਠ", "ਡ", "ਢ"],
    ["ਤ", "ਥ", "ਦ", "ਧ", "ਨ", "ਪ", "ਫ", "ਬ", "ਭ", "ਮ", "ਯ", "ਰ"],
    ["ਲ", "ਵ", "ਸ਼", "ਸ", "ਹ", "ਾ", "ਿ", "ੀ", "ੁ", "ੂ", "ੇ", "ੈ", "ੋ", "ੌ", "੍", "ਂ", "ਃ"],
  ],
  urdu: [
    ["ا", "آ", "ب", "پ", "ت", "ٹ", "ث", "ج", "چ", "ح", "خ", "د"],
    ["ڈ", "ذ", "ر", "ڑ", "ز", "ژ", "س", "ش", "ص", "ض", "ط", "ظ"],
    ["ع", "غ", "ف", "ق", "ک", "گ", "ل", "م", "ن", "و", "ہ", "ء"],
    ["ی", "ے", "ئ", "ں", "ؤ", "َ", "ِ", "ُ", "ّ", "ْ", "۔", "،", "؟"],
  ],
};

export const getAnalyzerLanguage = (code?: string) =>
  ANALYZER_LANGUAGE_OPTIONS.find((language) => language.code === code) || ANALYZER_LANGUAGE_OPTIONS[0];

export const getAnalyzerLanguageStorageKey = (audience: AnalyzerAudience) =>
  `medicore-analyzer-language:${audience}`;

export const formatAnalyzerUiText = (
  copy: AnalyzerUiCopy | undefined,
  key: string,
  fallback: string,
  values?: Record<string, string | number>
) => {
  const template = copy?.[key] || fallback;
  if (!values) return template;

  return Object.entries(values).reduce((result, [token, value]) => {
    return result.replaceAll(`{${token}}`, String(value));
  }, template);
};

export const getKeyboardRows = (languageCode: string) => {
  const language = getAnalyzerLanguage(languageCode);
  return language.keyboardLayout ? KEYBOARD_LAYOUTS[language.keyboardLayout] || [] : [];
};

export const shouldShowVirtualKeyboard = (languageCode: string) => getKeyboardRows(languageCode).length > 0;

export const insertTextAtCursor = (
  element: HTMLTextAreaElement | null,
  value: string,
  insertedText: string,
  onChange: (nextValue: string) => void
) => {
  if (!element) {
    onChange(`${value}${insertedText}`);
    return;
  }

  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? value.length;
  const nextValue = `${value.slice(0, start)}${insertedText}${value.slice(end)}`;
  const nextCursor = start + insertedText.length;

  onChange(nextValue);

  window.requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(nextCursor, nextCursor);
  });
};

export const removeTextAtCursor = (
  element: HTMLTextAreaElement | null,
  value: string,
  onChange: (nextValue: string) => void
) => {
  if (!value) return;

  if (!element) {
    onChange(value.slice(0, -1));
    return;
  }

  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? value.length;

  if (start !== end) {
    const nextValue = `${value.slice(0, start)}${value.slice(end)}`;
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start, start);
    });
    return;
  }

  if (start <= 0) return;

  const nextValue = `${value.slice(0, start - 1)}${value.slice(end)}`;
  const nextCursor = start - 1;
  onChange(nextValue);

  window.requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(nextCursor, nextCursor);
  });
};
