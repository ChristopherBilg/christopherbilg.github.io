#!/usr/bin/env node

/**
 * Script to split encrypted love letters into individual files.
 *
 * Usage: node scripts/split-letters.js <directory> <password> [--dry-run]
 *
 * Examples:
 *   node scripts/split-letters.js victoria-bilger mypassword
 *   node scripts/split-letters.js charlotte-bilger mypassword --dry-run
 *   node scripts/split-letters.js projects/xyz-love-letters mypassword
 *
 * This script will:
 * 1. Decrypt the existing encrypted-data.txt file in the specified directory
 * 2. Split each love letter into its own encrypted file in the letters/ subdirectory
 * 3. Create a manifest.json file listing all letter files
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ITERATIONS = 250000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64');
}

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

async function decryptData(ciphertext, password) {
  const encryptedBuffer = base64ToBuffer(ciphertext);
  const salt = encryptedBuffer.slice(0, SALT_LENGTH);
  const iv = encryptedBuffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const data = encryptedBuffer.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(password, salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  const authTagLength = 16;
  const authTag = data.slice(data.length - authTagLength);
  const encryptedData = data.slice(0, data.length - authTagLength);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
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

function printUsage() {
  console.log('Usage: node scripts/split-letters.js <directory> <password> [--dry-run]');
  console.log('');
  console.log('Arguments:');
  console.log('  <directory>  Path to love letters directory (e.g., victoria-bilger)');
  console.log('  <password>   Decryption password');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run    Show what would be done without making changes');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/split-letters.js victoria-bilger mypassword');
  console.log('  node scripts/split-letters.js charlotte-bilger mypassword --dry-run');
  console.log('  node scripts/split-letters.js projects/xyz-love-letters mypassword');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const targetDir = args[0];
  const password = args[1];
  const dryRun = args.includes('--dry-run');

  // Resolve paths relative to repo root
  const repoRoot = path.resolve(__dirname, '..');
  const targetPath = path.resolve(repoRoot, targetDir);
  const encryptedDataPath = path.join(targetPath, 'encrypted-data.txt');
  const lettersDir = path.join(targetPath, 'letters');
  const manifestPath = path.join(targetPath, 'manifest.json');

  // Validate directory exists
  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Directory not found: ${targetDir}`);
    process.exit(1);
  }

  // Read the encrypted data
  console.log(`Target directory: ${targetDir}`);
  console.log('Reading encrypted data...');

  if (!fs.existsSync(encryptedDataPath)) {
    console.error('Error: encrypted-data.txt not found in target directory');
    process.exit(1);
  }

  const ciphertext = fs.readFileSync(encryptedDataPath, 'utf8').trim();

  // Decrypt the data
  console.log('Decrypting data...');
  let letters;
  try {
    const plaintext = await decryptData(ciphertext, password);
    letters = JSON.parse(plaintext);
  } catch (error) {
    console.error('Error decrypting data. Check your password.');
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Found ${letters.length} love letters.`);

  if (dryRun) {
    console.log('\n--- DRY RUN ---');
    console.log('Would create the following files:');
    letters.forEach((letter) => {
      const filename = `${letter.date}.txt`;
      console.log(`  letters/${filename} - "${letter.title}"`);
    });
    console.log(`  manifest.json`);
    console.log('\nRun without --dry-run to create files.');
    return;
  }

  // Create letters directory
  if (!fs.existsSync(lettersDir)) {
    fs.mkdirSync(lettersDir);
    console.log('Created letters/ directory');
  }

  // Encrypt and save each letter
  const manifest = [];

  for (const letter of letters) {
    const filename = `${letter.date}.txt`;
    const filepath = path.join(lettersDir, filename);

    console.log(`Encrypting letter: ${letter.title} (${letter.date})`);

    const encryptedLetter = await encryptData(JSON.stringify(letter), password);
    fs.writeFileSync(filepath, encryptedLetter);

    manifest.push({
      file: `letters/${filename}`,
      date: letter.date
    });
  }

  // Sort manifest by date (newest first)
  manifest.sort((a, b) => b.date.localeCompare(a.date));

  // Save manifest
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Created manifest.json with ${manifest.length} entries`);

  // Backup original file
  const backupPath = path.join(targetPath, 'encrypted-data.txt.backup');
  fs.copyFileSync(encryptedDataPath, backupPath);
  console.log('Backed up original encrypted-data.txt to encrypted-data.txt.backup');

  console.log('\nDone! You can delete encrypted-data.txt.backup after verifying everything works.');
}

main().catch(console.error);
