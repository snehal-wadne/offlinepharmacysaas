const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const srcDir = path.join(__dirname, "..", "src");
let totalFiles = 0;
let failedFiles = 0;

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (/\.(js|jsx|ts|tsx)$/.test(file)) {
      totalFiles++;
      try {
        const code = fs.readFileSync(fullPath, "utf8");
        babel.transformSync(code, {
          filename: fullPath,
          configFile: path.join(__dirname, "..", "babel.config.js"),
        });
      } catch (err) {
        failedFiles++;
        console.error(
          `\n❌ ERROR in ${path.relative(path.join(__dirname, ".."), fullPath)}:`,
        );
        console.error(err.message);
      }
    }
  }
}

console.log("Validating all files in frontend/src...");
walkDir(srcDir);
console.log(
  `\nValidation complete: ${totalFiles - failedFiles}/${totalFiles} files passed. Failed: ${failedFiles}`,
);
if (failedFiles > 0) process.exit(1);
