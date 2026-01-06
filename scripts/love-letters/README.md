# Love Letters Scripts

Scripts for managing encrypted love letter collections.

## Overview

Each love letters directory (e.g., `victoria-bilger/`, `charlotte-bilger/`) contains:

- `index.html` - The webpage that decrypts and displays letters
- `manifest.json` - Lists all letter files
- `letters/` - Directory containing individual encrypted letter files

## Scripts

### split-letters.js

One-time migration script to split a single `encrypted-data.txt` file into individual letter files.

```bash
node scripts/love-letters/split-letters.js <directory> <password> [--dry-run]
```

**Arguments:**

- `<directory>` - Path to love letters directory (e.g., `victoria-bilger`)
- `<password>` - Decryption password

**Options:**

- `--dry-run` - Preview what would be created without making changes

**Examples:**

```bash
# Preview what will be created
node scripts/love-letters/split-letters.js victoria-bilger mypassword --dry-run

# Actually split the letters
node scripts/love-letters/split-letters.js victoria-bilger mypassword

# Works with nested directories too
node scripts/love-letters/split-letters.js projects/xyz-love-letters mypassword
```

**What it does:**

1. Reads and decrypts the source `encrypted-data.txt` file
2. Creates `letters/` directory
3. Encrypts each letter individually as `letters/YYYYMMDD.txt`
4. Creates `manifest.json` listing all letter files

> **Note:** This is a one-time migration script. After running it, you can delete the original `encrypted-data.txt` file.

### add-letter.js

Interactive script to add a new love letter to a collection.

```bash
node scripts/love-letters/add-letter.js <directory> <password>
```

**Arguments:**

- `<directory>` - Path to love letters directory
- `<password>` - Encryption password

**Examples:**

```bash
node scripts/love-letters/add-letter.js victoria-bilger mypassword
node scripts/love-letters/add-letter.js charlotte-bilger mypassword
node scripts/love-letters/add-letter.js projects/xyz-love-letters mypassword
```

**What it does:**

1. Prompts for letter title
2. Prompts for date in YYYYMMDD format
3. Prompts for body paragraphs (one per line, empty line to finish)
4. Encrypts and saves to `letters/YYYYMMDD.txt`
5. Updates `manifest.json`

## Workflows

### Adding a New Letter

```bash
# Run the interactive script
node scripts/love-letters/add-letter.js victoria-bilger YOUR_PASSWORD

# Follow the prompts:
# - Enter title
# - Enter date (YYYYMMDD)
# - Enter body paragraphs (one per line)
# - Press Enter on empty line when done
```

### Letter JSON Format

Each letter has the following structure:

```json
{
  "title": "Letter Title",
  "date": "20250106",
  "prettyDate": "January 6th, 2025",
  "body": [
    "First paragraph of the letter.",
    "Second paragraph of the letter.",
    "data:image/jpeg;base64,..."
  ]
}
```

**Notes:**

- `date` is used for sorting (newest first) and as the filename
- `prettyDate` is displayed on the webpage
- `body` is an array of paragraphs
- Body items starting with `data:image` are rendered as images

### Supported Directories

These directories are set up for love letters:

- `victoria-bilger/`
- `charlotte-bilger/`
- `cassandra-bilger/`
- `projects/xyz-love-letters/`

## Encryption Details

- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 with SHA-256, 250,000 iterations
- Salt: 16 bytes (random per encryption)
- IV: 12 bytes (random per encryption)
- Output format: Base64 encoded (salt + iv + ciphertext + auth tag)
