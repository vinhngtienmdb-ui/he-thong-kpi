const fs = require('fs');
const path = require('path');

const filesToPatch = [
  path.join(__dirname, '..', 'node_modules', 'html2canvas', 'dist', 'html2canvas.js'),
  path.join(__dirname, '..', 'node_modules', 'html2canvas', 'dist', 'html2canvas.esm.js'),
  path.join(__dirname, '..', 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js')
];

const targetPattern = /throw new Error\(["']Attempting to parse an unsupported color function ["'] \+ value\.name \+ ["']["']\);?/g;
const safeReplacement = 'return pack(0, 0, 0, 1);';

let patchedCount = 0;
for (const file of filesToPatch) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (targetPattern.test(content)) {
      content = content.replace(targetPattern, safeReplacement);
      fs.writeFileSync(file, content, 'utf8');
      patchedCount++;
      console.log(`[patch-html2canvas] Successfully patched: ${path.basename(file)}`);
    } else if (content.includes('Attempting to parse an unsupported color function')) {
      // Fallback in minified code if exact quote syntax differs
      content = content.replace(/throw new Error\([^)]*unsupported color function[^)]*\);?/g, safeReplacement);
      fs.writeFileSync(file, content, 'utf8');
      patchedCount++;
      console.log(`[patch-html2canvas] Successfully patched (fallback): ${path.basename(file)}`);
    }
  }
}

console.log(`[patch-html2canvas] Total files patched: ${patchedCount}`);
