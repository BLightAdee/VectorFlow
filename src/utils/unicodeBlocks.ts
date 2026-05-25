export interface UnicodeBlock {
  id: string;
  name: string;
  range: [number, number];
  description: string;
  defaultSelected: boolean;
  // A helper to get characters in this block.
  // We can filter out control characters and non-printable characters
  getCharacters: () => { char: string; code: number; name: string }[];
}

export const UNICODE_BLOCKS: UnicodeBlock[] = [
  {
    id: 'basic-latin-letters',
    name: 'Basic Latin (Letters)',
    range: [65, 122],
    description: 'Uppercase (A-Z) and lowercase (a-z) English letters',
    defaultSelected: true,
    getCharacters: () => {
      const chars = [];
      // A-Z
      for (let i = 65; i <= 90; i++) {
        chars.push({ char: String.fromCharCode(i), code: i, name: `Latin Capital Letter ${String.fromCharCode(i)}` });
      }
      // a-z
      for (let i = 97; i <= 122; i++) {
        chars.push({ char: String.fromCharCode(i), code: i, name: `Latin Small Letter ${String.fromCharCode(i)}` });
      }
      return chars;
    }
  },
  {
    id: 'basic-latin-digits',
    name: 'Basic Latin (Digits & Space)',
    range: [48, 57],
    description: 'Numbers (0-9) and Space',
    defaultSelected: true,
    getCharacters: () => {
      const chars = [{ char: ' ', code: 32, name: 'Space' }];
      for (let i = 48; i <= 57; i++) {
        chars.push({ char: String.fromCharCode(i), code: i, name: `Digit ${String.fromCharCode(i)}` });
      }
      return chars;
    }
  },
  {
    id: 'basic-latin-punctuation',
    name: 'Basic Latin (Punctuation)',
    range: [33, 64],
    description: 'Common punctuation marks (!, ?, @, #, etc.)',
    defaultSelected: false,
    getCharacters: () => {
      const symbols = [
        33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, // ! " # $ % & ' ( ) * + , - . /
        58, 59, 60, 61, 62, 63, 64, // : ; < = > ? @
        91, 92, 93, 94, 95, 96, // [ \ ] ^ _ `
        123, 124, 125, 126 // { | } ~
      ];
      return symbols.map(code => ({
        char: String.fromCharCode(code),
        code,
        name: `Punctuation ${String.fromCharCode(code)}`
      }));
    }
  },
  {
    id: 'latin-1-supplement',
    name: 'Latin-1 Supplement',
    range: [160, 255],
    description: 'Accented characters (é, ü, ñ) and currency symbols (€, £, ¥)',
    defaultSelected: false,
    getCharacters: () => {
      const keyCodes = [
        161, 162, 163, 165, 169, 176, 177, 191, // ¡, ¢, £, ¥, ©, °, ±, ¿
        192, 193, 196, 199, 200, 201, 207, 211, 214, 218, 220, // À, Á, Ä, Ç, È, É, Ï, Ó, Ö, Ú, Ü
        224, 225, 228, 231, 232, 233, 239, 243, 246, 250, 252, 255 // à, á, ä, ç, è, é, ï, ó, ö, ú, ü, ÿ
      ];
      return keyCodes.map(code => ({
        char: String.fromCharCode(code),
        code,
        name: `Latin-1 Char ${String.fromCharCode(code)}`
      }));
    }
  },
  {
    id: 'cyrillic',
    name: 'Cyrillic (Basic Russian)',
    range: [1040, 1103],
    description: 'Standard Russian Cyrillic alphabet (А-Я, а-я)',
    defaultSelected: false,
    getCharacters: () => {
      const chars = [];
      // А-Я
      for (let i = 1040; i <= 1071; i++) {
        chars.push({ char: String.fromCharCode(i), code: i, name: `Cyrillic Capital Letter` });
      }
      // а-я
      for (let i = 1072; i <= 1103; i++) {
        chars.push({ char: String.fromCharCode(i), code: i, name: `Cyrillic Small Letter` });
      }
      return chars;
    }
  },
  {
    id: 'greek',
    name: 'Greek and Coptic',
    range: [913, 969],
    description: 'Greek alphabet (Α-Ω, α-ω)',
    defaultSelected: false,
    getCharacters: () => {
      const chars = [];
      // Α-Ω (skipping some intermediate symbols)
      for (let i = 913; i <= 937; i++) {
        if (i === 930) continue; // Skip non-existent character code
        chars.push({ char: String.fromCharCode(i), code: i, name: `Greek Capital Letter` });
      }
      // α-ω
      for (let i = 945; i <= 969; i++) {
        chars.push({ char: String.fromCharCode(i), code: i, name: `Greek Small Letter` });
      }
      return chars;
    }
  },
  {
    id: 'hiragana',
    name: 'Japanese Hiragana',
    range: [12353, 12435],
    description: 'Japanese phonetic hiragana characters (あ-ん)',
    defaultSelected: false,
    getCharacters: () => {
      const chars = [];
      for (let i = 12353; i <= 12435; i++) {
        // Skip code points that are unassigned
        chars.push({ char: String.fromCharCode(i), code: i, name: `Hiragana Letter` });
      }
      return chars;
    }
  }
];

export function getCharactersForBlocks(blockIds: string[]) {
  const characters: { char: string; code: number; name: string; blockId: string }[] = [];
  const selectedBlocks = UNICODE_BLOCKS.filter(b => blockIds.includes(b.id));
  
  for (const block of selectedBlocks) {
    const blockChars = block.getCharacters();
    for (const bc of blockChars) {
      if (!characters.some(c => c.code === bc.code)) {
        characters.push({ ...bc, blockId: block.id });
      }
    }
  }
  
  return characters;
}
