const fs = require('fs');

const fonts = {
  'standard': {
    'A': ["  A  ", " A A ", "AAAAA", "A   A", "A   A"],
    'B': ["BBBB ", "B   B", "BBBB ", "B   B", "BBBB "],
    'C': [" CCC ", "C    ", "C    ", "C    ", " CCC "],
    'D': ["DDDD ", "D   D", "D   D", "D   D", "DDDD "],
    'E': ["EEEEE", "E    ", "EEE  ", "E    ", "EEEEE"],
    'F': ["FFFFF", "F    ", "FFF  ", "F    ", "F    "],
    'G': [" GGG ", "G    ", "G  GG", "G   G", " GGG "],
    'H': ["H   H", "H   H", "HHHHH", "H   H", "H   H"],
    'I': ["IIIII", "  I  ", "  I  ", "  I  ", "IIIII"],
    'J': ["JJJJJ", "  J  ", "  J  ", "J J  ", " J   "],
    'K': ["K   K", "K  K ", "KKK  ", "K  K ", "K   K"],
    'L': ["L    ", "L    ", "L    ", "L    ", "LLLLL"],
    'M': ["M   M", "MM MM", "M M M", "M   M", "M   M"],
    'N': ["N   N", "NN  N", "N N N", "N  NN", "N   N"],
    'O': [" OOO ", "O   O", "O   O", "O   O", " OOO "],
    'P': ["PPPP ", "P   P", "PPPP ", "P    ", "P    "],
    'Q': [" QQQ ", "Q   Q", "Q   Q", "Q  Q ", " QQ Q"],
    'R': ["RRRR ", "R   R", "RRRR ", "R R  ", "R  RR"],
    'S': [" SSS ", "S    ", " SSS ", "    S", " SSS "],
    'T': ["TTTTT", "  T  ", "  T  ", "  T  ", "  T  "],
    'U': ["U   U", "U   U", "U   U", "U   U", " UUU "],
    'V': ["V   V", "V   V", "V   V", " V V ", "  V  "],
    'W': ["W   W", "W   W", "W W W", "WW WW", "W   W"],
    'X': ["X   X", " X X ", "  X  ", " X X ", "X   X"],
    'Y': ["Y   Y", " Y Y ", "  Y  ", "  Y  ", "  Y  "],
    'Z': ["ZZZZZ", "   Z ", "  Z  ", " Z   ", "ZZZZZ"],
    ' ': ["     ", "     ", "     ", "     ", "     "],
    '?': [" ??? ", " ?  ?", "   ? ", "     ", "  ?  "]
  },
  'double': {
    'A': [" ╔═══╗ ", " ║   ║ ", " ╠═══╣ ", " ║   ║ ", " ╩   ╩ "],
    'B': [" ╠══╗  ", " ║  ║  ", " ╠══╣  ", " ║  ║  ", " ╩══╝  "],
    'C': [" ╔═══╗ ", " ║     ", " ║     ", " ║     ", " ╚═══╝ "],
    'D': [" ╠══╗  ", " ║  ║  ", " ║  ║  ", " ║  ║  ", " ╩══╝  "],
    'E': [" ╔═══╗ ", " ║     ", " ╠═══  ", " ║     ", " ╚═══╝ "],
    'G': [" ╔═══╗ ", " ║     ", " ║  ═╗ ", " ║   ║ ", " ╚═══╝ "],
    'N': [" ║═╗ ║ ", " ║ ║ ║ ", " ║ ║ ║ ", " ║ ╚╗║ ", " ╩  ╚╝ "],
    'T': [" ╦═══╦ ", "   ║   ", "   ║   ", "   ║   ", "   ╩   "],
    'Q': [" ╔═══╗ ", " ║   ║ ", " ║   ║ ", " ║  ═╣ ", " ╚═══╩ "],
    ' ': ["       ", "       ", "       ", "       ", "       "]
  }
};

const colors = {
  'purple': '\x1b[35m',
  'reset': '\x1b[0m'
};

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: node generate_ascii.js <text> <output_file> [style] [color]");
  process.exit(1);
}

const text = args[0].toUpperCase();
const outputFile = args[1];
const style = args[2] || 'standard';
const colorName = args[3] || '';

const font = fonts[style] || fonts['standard'];
const colorCode = colors[colorName] || '';
const resetCode = colorCode ? colors['reset'] : '';

let artLines = ["", "", "", "", ""];

for (const char of text) {
  const charArt = font[char] || fonts['standard'][char] || fonts['standard']['?'];
  for (let i = 0; i < 5; i++) {
    artLines[i] += charArt[i];
  }
}

const finalArt = artLines.map(line => colorCode + line + resetCode).join('\n') + '\n';

fs.promises.writeFile(outputFile, finalArt)
  .then(() => {
    console.log(`Successfully wrote ${style} ${colorName} ASCII art to ${outputFile}`);
    console.log("Preview:");
    console.log(finalArt);
  })
  .catch((err) => {
    console.error(`Error writing file: ${err.message}`);
    process.exit(1);
  });