import path from 'node:path';
import {GoogleGenAI} from '@google/genai';
import * as fs from 'fs';
import {
	findFileInTree,
	generateHash,
	getTreeJsonPath,
	updateFileHashes,
} from './treesitter.js';
import {apiKey, getDebugMode} from './ConfigManagement.js';

const DEBUG = getDebugMode();
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'catdoc-debug.log');

const googleAi = new GoogleGenAI({apiKey: apiKey});

// Initialize logging
try {
	if (!fs.existsSync(LOGS_DIR)) {
		fs.mkdirSync(LOGS_DIR, {recursive: true});
	}
} catch (error) {
	console.error('Failed to initialize logging:', error);
}

// Intentionally unused for now, keeping for future debugging
// @ts-ignore
const debugLog = (message: string) => {
	if (DEBUG) {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}] ${message}\n`;
		try {
			fs.appendFileSync(LOG_FILE, logMessage);
		} catch (error) {
			// Silently fail as we can't use console.log during operations
		}
	}
};

/**
 * Generates docstrings for a file if it has changed or is not yet documented
 *
 * @param filePath - Path to the file to document
 * @returns Promise that resolves to true if docstrings were generated, false otherwise
 */
export async function generateDocStrings(filePath: string): Promise<boolean> {
	// Only try to read the tree when the function is called
	const treeJsonPath = getTreeJsonPath(process.cwd());

	// Check if the tree.json file exists
	if (!fs.existsSync(treeJsonPath)) {
		// Just generate docstrings without checking hash
		return await generateDocstringsForFile(filePath);
	}

	// File exists, proceed with tree comparison
	const treeJson = JSON.parse(fs.readFileSync(treeJsonPath, 'utf8'));
	const result = findFileInTree(treeJson, filePath);
	const fileContents = fs.readFileSync(filePath, {encoding: 'utf8', flag: 'r'});

	// If file not in tree or hash is different, generate docstrings
	const currentHash = generateHash(fileContents);
	const isDiff = !result || currentHash !== result.file_hash;

	if (isDiff) {
		const success = await generateDocstringsForFile(filePath);
		// Update the hash in the tree
		updateFileHashes(process.cwd(), [filePath]);
		return success;
	}

	// No changes detected, no docstrings needed
	return false;
}

/**
 * Internal helper to generate docstrings for a file
 *
 * @param filePath - Path to the file to document
 * @returns Promise that resolves to true if docstrings were generated, false otherwise
 */
async function generateDocstringsForFile(filePath: string): Promise<boolean> {
	try {
		const fileContents = fs.readFileSync(filePath, {
			encoding: 'utf8',
			flag: 'r',
		});
		const fileExt = path.extname(filePath).substring(1); // Remove the dot
		const fileType =
			fileExt === 'ts'
				? 'TypeScript'
				: fileExt === 'tsx'
				? 'TSX'
				: fileExt === 'js'
				? 'JavaScript'
				: fileExt === 'jsx'
				? 'JSX'
				: fileExt === 'py'
				? 'Python'
				: 'Unknown';

		// Update the prompt to specifically ask for raw code without Markdown formatting
		const docString = `
Please analyze the following source code and generate docstrings for complex or non-obvious functions, classes, methods, and interfaces. The file type is "${fileType}" and requires language-appropriate documentation.

SELECTIVE DOCUMENTATION GUIDELINES:
- Focus on documenting complex logic, public APIs, and non-obvious behavior
- DO NOT document simple, self-explanatory code segments (e.g., simple getters/setters, basic React state updates)
- DO NOT add comments to every function - prioritize where documentation adds real value
- For simple UI components, a single comment explaining the component's purpose is often sufficient
- Skip documenting trivial utility functions where the name clearly explains the purpose

For elements that DO need documentation:
1. Create a concise summary of what it does
2. Document complex parameters and return values
3. Document any non-obvious behavior, edge cases, or potential errors
4. Include examples only for complex usage patterns

For TypeScript/TSX files:
- Use JSDoc-style comments with /** ... */
- Document complex parameters with @param {type} name - description
- Document non-trivial returns with @returns {type} description
- Focus on interfaces and types that define your public API

For JavaScript/JSX files:
- Use JSDoc-style comments with /** ... */
- Keep comments minimal and targeted to complex logic
- Include type hints only where they add clarity

For Python files:
- Use Google-style docstrings with triple quotes """
- Document only non-obvious parameters and return values
- Follow PEP 257 conventions but be selective

IMPORTANT: Return the complete source code with added docstrings. DO NOT wrap the code in markdown code blocks. Maintain the existing code style and formatting. Only add or update docstrings—do not modify the actual code functionality.

If an element already has documentation, enhance it only if it's missing important information.

Code:
${fileContents}
`;
		const response = await googleAi.models.generateContent({
			model: 'gemini-2.5-pro',
			contents: docString,
		});

		if (response.text) {
			// Process the response to remove markdown code blocks if present
			let processedText = response.text;

			// Check if the response is wrapped in code fence blocks
			const codeBlockRegex = /^```(?:tsx?|jsx?|python|py)?\n([\s\S]*?)```$/s;
			const match = processedText.match(codeBlockRegex);

			if (match && match[1]) {
				// Extract just the code from between the code fences
				processedText = match[1];
				debugLog(`Removed code fence markers from response for ${filePath}`);
			}

			// Check if there are multiple code blocks or other formatting issues
			const multiBlockRegex = /```(?:tsx?|jsx?|python|py)?|```/g;
			if (multiBlockRegex.test(processedText)) {
				// Complex case with multiple code blocks - perform more aggressive cleaning
				processedText = processedText.replace(multiBlockRegex, '');
				debugLog(
					`Cleaned multiple code fence markers from response for ${filePath}`,
				);
			}

			fs.writeFileSync(filePath, processedText);
			return true;
		} else {
			return false;
		}
	} catch (error) {
		return false;
	}
}
