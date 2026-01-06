#!/usr/bin/env node

/**
 * Script to add a new love letter to a collection.
 *
 * Usage: node scripts/add-letter.js <directory> <password>
 *
 * Examples:
 *   node scripts/add-letter.js victoria-bilger mypassword
 *   node scripts/add-letter.js charlotte-bilger mypassword
 *   node scripts/add-letter.js projects/xyz-love-letters mypassword
 *
 * This script will:
 * 1. Prompt for letter details (title, date, body)
 * 2. Encrypt the letter and save to letters/ directory
 * 3. Update the manifest.json file
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ITERATIONS = 250000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function bufferToBase64(buffer) {
  return buffer.toString('base64');
}

async function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function encryptData(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, encrypted, authTag]);
  return bufferToBase64(combined);
}

function formatDate(dateStr) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const year = dateStr.slice(0, 4);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);

  const suffix = (d) => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  return `${months[month]} ${day}${suffix(day)}, ${year}`;
}

async function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function promptMultiline(rl, question) {
  console.log(question);
  console.log('(Enter each paragraph on a new line. Enter an empty line when done.)');

  const lines = [];
  const askLine = () => {
    return new Promise((resolve) => {
      rl.question('> ', (line) => {
        if (line === '') {
          resolve(lines);
        } else {
          lines.push(line);
          askLine().then(resolve);
        }
      });
    });
  };

  return askLine();
}

function printUsage() {
  console.log('Usage: node scripts/add-letter.js <directory> <password>');
  console.log('');
  console.log('Arguments:');
  console.log('  <directory>  Path to love letters directory (e.g., victoria-bilger)');
  console.log('  <password>   Encryption password');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/add-letter.js victoria-bilger mypassword');
  console.log('  node scripts/add-letter.js charlotte-bilger mypassword');
  console.log('  node scripts/add-letter.js projects/xyz-love-letters mypassword');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const targetDir = args[0];
  const password = args[1];

  // Resolve paths relative to repo root
  const repoRoot = path.resolve(__dirname, '..');
  const targetPath = path.resolve(repoRoot, targetDir);
  const lettersDir = path.join(targetPath, 'letters');
  const manifestPath = path.join(targetPath, 'manifest.json');

  // Validate directory exists
  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Directory not found: ${targetDir}`);
    process.exit(1);
  }

  // Ensure letters directory exists
  if (!fs.existsSync(lettersDir)) {
    fs.mkdirSync(lettersDir);
    console.log('Created letters/ directory');
  }

  // Load existing manifest
  let manifest = [];
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n=== Add New Love Letter to ${targetDir} ===\n`);

  const title = await prompt(rl, 'Title: ');
  const dateStr = await prompt(rl, 'Date (YYYYMMDD): ');

  if (!/^\d{8}$/.test(dateStr)) {
    console.error('Error: Date must be in YYYYMMDD format');
    rl.close();
    process.exit(1);
  }

  const prettyDate = formatDate(dateStr);
  console.log(`Formatted date: ${prettyDate}`);

  const body = await promptMultiline(rl, '\nBody paragraphs:');

  rl.close();

  if (body.length === 0) {
    console.error('Error: Letter body cannot be empty');
    process.exit(1);
  }

  const letter = {
    title,
    date: dateStr,
    prettyDate,
    body
  };

  console.log('\n--- Letter Preview ---');
  console.log(`Title: ${title}`);
  console.log(`Date: ${prettyDate}`);
  console.log(`Body: ${body.length} paragraph(s)`);
  console.log('');

  // Encrypt and save
  const filename = `${dateStr}.txt`;
  const filepath = path.join(lettersDir, filename);

  // Check if file already exists
  if (fs.existsSync(filepath)) {
    console.log(`Warning: ${filename} already exists. Overwriting...`);
  }

  console.log('Encrypting letter...');
  const encryptedLetter = await encryptData(JSON.stringify(letter), password);
  fs.writeFileSync(filepath, encryptedLetter);
  console.log(`Saved to ${targetDir}/letters/${filename}`);

  // Update manifest
  const existingIndex = manifest.findIndex((e) => e.date === dateStr);
  if (existingIndex >= 0) {
    manifest[existingIndex] = { file: `letters/${filename}`, date: dateStr };
  } else {
    manifest.push({ file: `letters/${filename}`, date: dateStr });
  }

  // Sort by date (newest first)
  manifest.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('Updated manifest.json');

  console.log('\nDone! Your new love letter has been added.');
}

main().catch(console.error);
