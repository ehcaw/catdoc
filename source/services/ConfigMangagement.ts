import {fileURLToPath} from 'url';
import path from 'path';
import * as fs from 'fs';

/**
 * Gets the project root directory from the current file
 *
 * @param levelsUp Number of directory levels to go up from current file
 * @returns Absolute path to the project root
 */
function getProjectRoot(levelsUp = 2): string {
	// For ESM modules
	if (typeof import.meta !== 'undefined') {
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = path.dirname(__filename);
		return path.resolve(__dirname, ...Array(levelsUp).fill('..'));
	}

	// For CommonJS
	return path.resolve(__dirname, ...Array(levelsUp).fill('..'));
}

// Usage:
const projectRoot = getProjectRoot();
const configPath = path.join(projectRoot, 'catdoc.config.json');
export const apiKey = JSON.parse(
	fs.readFileSync(configPath, 'utf8'),
).google_api_key;

export function updateApiKey(key: string) {
	let configContents = fs.readFileSync(configPath, {encoding: 'utf8'});
	let configJson = JSON.parse(configContents);
	configJson.google_api_key = key;
	fs.writeFileSync(configPath, JSON.stringify(configJson));
}

/**
 * Updates the .gitignore file in the specified directory to ensure catdoc-specific
 * directories are ignored. Only adds entries that aren't already present.
 *
 * @param directoryPath - Path to the directory containing the .gitignore file
 * @returns void
 */
export function gitignoreCatdocDirectories(directoryPath: string): void {
	const gitignorePath = path.join(directoryPath, '.gitignore');
	const catdocDirsToIgnore = [
		'logs/',
		'docs/',
		'.catdoc.cache.json',
		'*.tree.json',
		'*.cache.json',
	];

	try {
		// Read the existing gitignore file or create an empty one
		let gitignoreContent = '';
		if (fs.existsSync(gitignorePath)) {
			gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
		}

		// Split by lines and trim each line
		const existingLines = gitignoreContent.split('\n').map(line => line.trim());

		// Create a set for easier checking
		const existingEntries = new Set(existingLines);

		// Collect entries that need to be added
		const entriesToAdd = catdocDirsToIgnore.filter(entry => {
			// Check if this exact entry exists
			if (existingEntries.has(entry)) return false;

			// Check if any line ends with this entry (handles different path formats)
			return !existingLines.some(
				line =>
					line.endsWith(entry) &&
					(line === entry ||
						line.endsWith(`/${entry}`) ||
						line.endsWith(`\\${entry}`)),
			);
		});

		// If there are entries to add, append them to the gitignore
		if (entriesToAdd.length > 0) {
			// Add a comment to identify our additions
			let newContent = gitignoreContent;

			// Add a blank line at the end if the file doesn't end with one
			if (newContent.length > 0 && !newContent.endsWith('\n')) {
				newContent += '\n';
			}

			// Add comment and entries
			newContent += '\n# Added by catdoc\n';
			newContent += entriesToAdd.join('\n');
			newContent += '\n';

			// Write the updated gitignore
			fs.writeFileSync(gitignorePath, newContent, 'utf-8');
		} else {
		}
	} catch (error) {}
}
