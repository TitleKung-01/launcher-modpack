const fs = require('fs');
const path = require('path');

const cookieJsPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'tough-cookie',
  'lib',
  'cookie.js'
);

if (!fs.existsSync(cookieJsPath)) {
  console.log('[patch-tough-cookie] tough-cookie not found, skipping.');
  process.exit(0);
}

const source = fs.readFileSync(cookieJsPath, 'utf8');
const target = "punycode = require('punycode');";
const replacement = "punycode = require('punycode/');";

if (!source.includes(target)) {
  if (source.includes(replacement)) {
    console.log('[patch-tough-cookie] already patched.');
    process.exit(0);
  }

  console.log('[patch-tough-cookie] target line not found, skipping.');
  process.exit(0);
}

fs.writeFileSync(cookieJsPath, source.replace(target, replacement), 'utf8');
console.log('[patch-tough-cookie] patched to use userland punycode.');
