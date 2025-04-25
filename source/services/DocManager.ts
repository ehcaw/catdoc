// catdoc/source/services/DocManager.ts
import fs from 'node:fs';
import path from 'node:path';
import {simpleGit, SimpleGit} from 'simple-git';
import {GoogleGenAI} from '@google/genai';
import {FileDocumentation, ProjectDocumentation} from '../types/docs.js';
import {apiKey, getDebugMode} from './ConfigManagement.js'; // Corrected import path
import chokidar from 'chokidar';
import pkg from 'glob'; // Added for glob processing
const {glob} = pkg;
import {promisify} from 'node:util'; // Added for promisify

const globPromise = promisify(glob); // Added promisified glob

// Debug logging setup
const DEBUG = getDebugMode();
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'catdoc-debug.log');

// Initialize logging
try {
	if (!fs.existsSync(LOGS_DIR)) {
		fs.mkdirSync(LOGS_DIR, {recursive: true});
	}
} catch (error) {
	console.error('Failed to initialize logging:', error);
}

const debugLog = (message: string) => {
	if (DEBUG) {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}] ${message}\n`;
		try {
			fs.appendFileSync(LOG_FILE, logMessage);
		} catch (error) {
			// Silently fail
		}
	}
};

debugLog('DocManager logging initialized');

export class DocManager {
	private docsPath: string;
	private htmlPath: string;
	private git: SimpleGit;
	private genAI: GoogleGenAI;
	private projectDocs: ProjectDocumentation;
	public workspacePath: string;
	private readonly IGNORED_PATTERNS = [
		// Keep existing patterns
		/\.json$/,
		/docs[\\\/](files|html)[\\\/]/,
		/\.log$/,
		/\.lock$/,
		/\bnode_modules\b/,
		/\.git\b/,
		// --- Add this line ---
		/\bdist\b/, // Ignore the dist directory
		// --------------------
		/catdoc\.tree\.json$/,
	];
	public directoryWatcher;
	private saveTimeout: NodeJS.Timeout | null = null;

	// --- Queue Implementation ---
	private processingQueue: string[] = []; // Holds relative paths
	private isProcessingQueue: boolean = false;
	private readonly MAX_CONCURRENT_GENERATIONS = 3; // Limit concurrent AI calls
	// --------------------------

	constructor(workspacePath: string) {
		debugLog(`Initializing DocManager with workspace path: ${workspacePath}`);
		this.workspacePath = workspacePath;

		this.docsPath = path.join(this.workspacePath, 'docs');
		this.htmlPath = path.join(this.docsPath, 'html');
		// Ensure the 'files' directory exists within 'docs'
		const filesDirPath = path.join(this.docsPath, 'files');

		this.git = simpleGit(this.workspacePath);

		// Initialize Google Gemini
		if (!apiKey) {
			throw new Error('GOOGLE_API_KEY is not set in environment variables');
		}
		this.genAI = new GoogleGenAI({apiKey: apiKey});

		// --- Ensure Directories Exist ---
		try {
			if (!fs.existsSync(this.docsPath)) {
				debugLog(`Creating docs directory: ${this.docsPath}`);
				fs.mkdirSync(this.docsPath, {recursive: true});
			}
			if (!fs.existsSync(this.htmlPath)) {
				debugLog(`Creating html directory: ${this.htmlPath}`);
				fs.mkdirSync(this.htmlPath, {recursive: true});
			}
			if (!fs.existsSync(filesDirPath)) {
				debugLog(`Creating files directory: ${filesDirPath}`);
				fs.mkdirSync(filesDirPath, {recursive: true});
			}
		} catch (error) {
			debugLog(`Error creating documentation directories: ${error}`);
			// Decide if this is a critical error
		}
		// --- End Directory Check ---

		this.directoryWatcher = chokidar.watch([], {
			// Start watching nothing initially
			persistent: true,
			ignoreInitial: true,
			ignored: [
				/(^|[\/\\])\../, // Ignore hidden files/directories
				this.docsPath, // Ignore the entire docs directory
				'**/node_modules/**', // More robust ignore for node_modules
				'**/.git/**', // More robust ignore for .git
				'**/dist/**',
				...this.IGNORED_PATTERNS,
			],
			awaitWriteFinish: {
				stabilityThreshold: 500,
				pollInterval: 100,
			},
		});

		// --- Watcher using the Queue ---
		const debouncedQueueAdd = debounce(
			async (filePath: string, eventType: 'add' | 'change' | 'unlink') => {
				const relativePath = path.relative(this.workspacePath, filePath);
				const normalizedRelativePath = this.normalizePath(relativePath); // Use normalizePath

				// Double-check ignore patterns here as chokidar might sometimes slip
				if (this.shouldIgnoreFile(normalizedRelativePath)) {
					// debugLog(`Ignoring ${eventType} event for ${normalizedRelativePath} based on pattern (post-watch).`);
					return;
				}

				debugLog(`Watcher detected ${eventType} in: ${normalizedRelativePath}`);

				if (eventType === 'unlink') {
					this.removeDocumentation(normalizedRelativePath); // Remove immediately
				} else {
					// Check if file still exists for add/change before queueing
					if (fs.existsSync(filePath)) {
						this.addToQueue(normalizedRelativePath);
					} else {
						debugLog(
							`File ${normalizedRelativePath} reported as ${eventType} but no longer exists. Removing if present.`,
						);
						this.removeDocumentation(normalizedRelativePath);
					}
				}
			},
			1000,
		);

		this.directoryWatcher
			.on('change', filePath => debouncedQueueAdd(filePath, 'change'))
			.on('add', filePath => debouncedQueueAdd(filePath, 'add'))
			.on('unlink', filePath => debouncedQueueAdd(filePath, 'unlink'))
			.on('error', error => debugLog(`Watcher error: ${error}`));
		// ------------------------------

		// Load existing documentation *after* ensuring directories exist
		this.projectDocs = this.loadDocs();
		debugLog('DocManager constructor finished');
	}

	/**
	 * Adds a file path to the processing queue and starts processing if not already running.
	 * @param relativePath Relative path of the file to process (must use forward slashes).
	 */
	private addToQueue(relativePath: string) {
		const normalizedPath = this.normalizePath(relativePath); // Ensure normalization
		if (!this.processingQueue.includes(normalizedPath)) {
			this.processingQueue.push(normalizedPath);
			debugLog(
				`Added ${normalizedPath} to processing queue. Queue size: ${this.processingQueue.length}`,
			);
			this.processDocumentationQueue(); // Start processing if not already running
		} else {
			debugLog(`${normalizedPath} is already in the queue.`);
		}
	}

	/**
	 * Processes the documentation generation queue concurrently.
	 */
	private async processDocumentationQueue() {
		if (this.isProcessingQueue) {
			// debugLog('Queue processing already in progress.'); // Reduce noise
			return;
		}
		if (this.processingQueue.length === 0) {
			// debugLog('Queue is empty, nothing to process.'); // Reduce noise
			return;
		}

		this.isProcessingQueue = true;
		debugLog(
			`Starting queue processing. Queue size: ${this.processingQueue.length}`,
		);

		while (this.processingQueue.length > 0) {
			const batchSize = Math.min(
				this.MAX_CONCURRENT_GENERATIONS,
				this.processingQueue.length,
			);
			const batch = this.processingQueue.splice(0, batchSize);

			debugLog(
				`Processing batch of ${batch.length} files: [${batch.join(', ')}]`,
			);

			const promises = batch.map(relativePath =>
				this.generateDocumentation(relativePath) // generateDocumentation handles file saving
					.catch(error => {
						debugLog(`Error processing ${relativePath} from queue: ${error}`);
						return null; // Indicate failure
					}),
			);

			await Promise.all(promises);
			// No need to call saveDocs here, generateDocumentation uses debounceSave

			// debugLog(`Batch finished. Remaining queue size: ${this.processingQueue.length}`);

			if (this.processingQueue.length > 0) {
				await new Promise(resolve => setTimeout(resolve, 200)); // Short delay
			}
		}

		this.isProcessingQueue = false;
		debugLog('Queue processing finished.');
		// Final explicit save might be useful after the queue is fully processed
		this.saveDocs();
	}

	/**
	 * Initializes the DocManager: Loads docs, starts watcher, and triggers background scan.
	 */
	async initialize(): Promise<boolean> {
		debugLog('Initializing DocManager...');
		try {
			// Ensure projectDocs is loaded (should be done in constructor, but double-check)
			if (!this.projectDocs) {
				this.projectDocs = this.loadDocs();
			}

			// Start watching the workspace root (chokidar handles recursion based on 'ignored')
			this.watchDirectory(this.workspacePath);
			debugLog(`Started watching directory: ${this.workspacePath}`);

			// Trigger a full scan and queue generation for missing/outdated files (background)
			this.generateAllDocsForWorkspace(false)
				.then(result => {
					debugLog(
						`Background documentation scan completed: ${JSON.stringify(
							result,
						)}`,
					);
				})
				.catch(error => {
					debugLog(`Error during background documentation scan: ${error}`);
				});

			debugLog('DocManager initialized. Background processing may be ongoing.');
			return true;
		} catch (error) {
			debugLog(`Error during DocManager initialization: ${error}`);
			return false;
		}
	}

	/**
	 * Shuts down the DocManager, closing watchers and saving state.
	 */
	async shutdown() {
		debugLog('Shutting down DocManager...');
		if (this.directoryWatcher) {
			await this.directoryWatcher.close();
			debugLog('Directory watcher closed');
		}
		this.saveDocs(); // Ensure final save
		debugLog('DocManager shutdown complete.');
	}

	/**
	 * Debounces the saving of the main docs.json file.
	 */
	private debounceSave() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(() => {
			this.saveDocs();
		}, 2000); // Increase debounce slightly
	}

	/**
	 * Normalizes a file path to use forward slashes and be relative to the workspace.
	 */
	private normalizePath(filePath: string): string {
		let relativePath = path.isAbsolute(filePath)
			? path.relative(this.workspacePath, filePath)
			: filePath;
		// Always use forward slashes, remove leading ./ if present
		return relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
	}

	/**
	 * Loads the main project documentation state from docs/docs.json.
	 */
	private loadDocs(): ProjectDocumentation {
		const docsFile = path.join(this.docsPath, 'docs.json');
		debugLog(`Loading docs from: ${docsFile}`);
		if (fs.existsSync(docsFile)) {
			try {
				const data = JSON.parse(fs.readFileSync(docsFile, 'utf-8'));
				if (!data.files) data.files = {}; // Ensure files object exists
				// Normalize paths in loaded data
				const normalizedFiles: {[key: string]: FileDocumentation} = {};
				for (const key in data.files) {
					const normalizedKey = this.normalizePath(key);
					normalizedFiles[normalizedKey] = data.files[key];
					// Update path within the doc object itself too
					if (normalizedFiles[normalizedKey]) {
						normalizedFiles[normalizedKey].path = normalizedKey;
					}
				}
				data.files = normalizedFiles;
				return data;
			} catch (error) {
				debugLog(`Error parsing docs.json: ${error}. Starting fresh.`);
			}
		}
		debugLog('No existing docs found, creating new documentation structure');
		return {version: '1.0.0', lastUpdated: new Date().toISOString(), files: {}};
	}

	/**
	 * Saves the current project documentation state to docs/docs.json.
	 * Excludes file content to save disk space and reduce file size.
	 */
	private saveDocs() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}

		const docsFile = path.join(this.docsPath, 'docs.json');

		// Update the main timestamp before saving
		this.projectDocs.lastUpdated = new Date().toISOString();

		try {
			// Create a deep copy of the documentation without content
			const docsCopy: ProjectDocumentation = {
				version: this.projectDocs.version,
				lastUpdated: this.projectDocs.lastUpdated,
				files: {} as {[key: string]: FileDocumentation},
			};

			// Copy all files but omit the content field
			for (const filePath in this.projectDocs.files) {
				const file = this.projectDocs.files[filePath];
				if (file) {
					docsCopy.files[filePath] = {
						path: file.path,
						lastUpdated: file.lastUpdated,
						summary: file.summary,
						type: file.type,
						hash: file.hash,
						preview: file.preview,
						lastModified: file.lastModified,
					};
				}
			}

			debugLog(
				`Saving docs to: ${docsFile} (${
					Object.keys(this.projectDocs.files).length
				} files, content excluded)`,
			);

			fs.writeFileSync(docsFile, JSON.stringify(docsCopy, null, 2));
		} catch (error) {
			debugLog(`Error saving docs.json: ${error}`);
		}
	}

	async getChangedFiles(): Promise<string[]> {
		try {
			const status = await this.git.status();
			return [...status.modified, ...status.not_added, ...status.created].map(
				p => this.normalizePath(p),
			);
		} catch (error) {
			debugLog(`Error getting git status: ${error}`);
			return [];
		}
	}

	/**
	 * Gets a short preview of a file's content.
	 */
	private getFilePreview(filePath: string): string {
		try {
			// Expects absolute path or path relative to workspace
			const absolutePath = path.isAbsolute(filePath)
				? filePath
				: path.join(this.workspacePath, filePath);
			if (!fs.existsSync(absolutePath)) return 'File not found for preview';
			const content = fs.readFileSync(absolutePath, 'utf-8');
			const lines = content.split('\n').slice(0, 10); // Increased preview lines slightly
			return lines.join('\n') + (lines.length >= 10 ? '\n...' : '');
		} catch (error) {
			debugLog(`Error getting file preview for ${filePath}: ${error}`);
			return 'Unable to read file content';
		}
	}

	/**
	 * Adds a directory to the file watcher.
	 */
	public watchDirectory(dirPath: string): void {
		const absolutePath = path.resolve(this.workspacePath, dirPath);
		// Pass absolute path to watcher, it handles ignoring based on patterns
		this.directoryWatcher.add(absolutePath);
		// debugLog(`Watching directory: ${absolutePath}`); // Keep log optional
	}

	/**
	 * Checks if a given relative path should be ignored based on defined patterns.
	 */
	private shouldIgnoreFile(relativePath: string): boolean {
		const normalizedPath = this.normalizePath(relativePath); // Ensure comparison uses normalized path
		// Check against directory ignore patterns first
		if (
			normalizedPath.startsWith('node_modules/') ||
			normalizedPath.startsWith('.git/') ||
			normalizedPath.startsWith('docs/')
		) {
			return true;
		}
		// Check regex patterns
		return this.IGNORED_PATTERNS.some(pattern => pattern.test(normalizedPath));
	}

	/**
	 * Scans the workspace, compares with existing docs, and queues outdated/missing files.
	 */
	async generateAllDocsForWorkspace(
		forceRegenerate = false,
	): Promise<{total: number; queued: number; skipped: number}> {
		debugLog(
			`Starting workspace documentation scan (forceRegenerate: ${forceRegenerate})`,
		);
		const scanPattern = '**/*';
		let files: string[] = []; // Initialize as empty array

		try {
			// Use glob to find all files, respecting ignores common ignores
			const matches = await globPromise(scanPattern, {
				cwd: this.workspacePath,
				absolute: true,
				nodir: true, // Only files
				ignore: ['node_modules/**', '.git/**', 'docs/**', 'dist/**'],
				dot: false,
			});
			files = matches;
		} catch (error) {
			debugLog(`Error during glob scan: ${error}`);
			return {total: 0, queued: 0, skipped: 0};
		}

		// Further filter based on IGNORED_PATTERNS regex
		const validFiles = files.filter(
			file => !this.shouldIgnoreFile(path.relative(this.workspacePath, file)),
		);

		debugLog(
			`Found ${validFiles.length} potentially relevant files after filtering`,
		);

		let queued = 0;
		let skipped = 0;

		for (const absoluteFilePath of validFiles) {
			const relativePath = this.normalizePath(
				path.relative(this.workspacePath, absoluteFilePath),
			);
			let shouldQueue = forceRegenerate;

			if (!shouldQueue) {
				const existingDoc = this.projectDocs.files[relativePath];
				if (!existingDoc) {
					shouldQueue = true;
				} else {
					try {
						const stats = fs.statSync(absoluteFilePath);
						const fileModified = stats.mtimeMs; // Use ms for more precision
						const docUpdated = existingDoc.lastModified; // Compare against file mtime stored in doc
						if (!docUpdated || fileModified > docUpdated) {
							shouldQueue = true;
						}
					} catch (statError) {
						debugLog(
							`Error getting stats for ${relativePath}: ${statError}. Queuing.`,
						);
						shouldQueue = true;
					}
				}
			}

			if (shouldQueue) {
				this.addToQueue(relativePath);
				queued++;
			} else {
				skipped++;
			}
		}

		this.debounceSave(); // Save potentially updated lastUpdated timestamp
		debugLog(
			`Workspace scan complete. Queued: ${queued}, Skipped: ${skipped}, Total Files Scanned: ${validFiles.length}`,
		);
		return {total: validFiles.length, queued, skipped};
	}

	/**
	 * Generates documentation for a single file (usually called by the queue processor).
	 */
	async generateDocumentation(
		relativePath: string,
	): Promise<FileDocumentation> {
		const normalizedRelativePath = this.normalizePath(relativePath);
		const absolutePath = path.join(this.workspacePath, normalizedRelativePath);

		try {
			// debugLog(`Generating documentation for: ${normalizedRelativePath}`); // Reduce log noise

			if (!fs.existsSync(absolutePath)) {
				debugLog(`File deleted before generation: ${absolutePath}. Removing.`);
				this.removeDocumentation(normalizedRelativePath);
				throw new Error(`File not found during generation: ${absolutePath}`);
			}

			const content = fs.readFileSync(absolutePath, 'utf-8');
			// Skip generation for empty files
			if (!content.trim()) {
				debugLog(`Skipping empty file: ${normalizedRelativePath}`);
				// Create a minimal doc entry or remove existing one? Let's remove.
				this.removeDocumentation(normalizedRelativePath);
				throw new Error(`Skipped empty file: ${normalizedRelativePath}`);
			}

			const fileType = path.extname(absolutePath).slice(1);

			const prompt = `Please provide a concise technical summary of this ${fileType} code file. Focus only on:\n1. The main purpose of the file\n2. Each method/function with a one-line description\n3. Key data structures or types\nKeep the summary under 200 words and use bullet points for clarity.\n\nCode:\n${content.slice(
				0,
				15000,
			)}`; // Limit context size for AI

			// debugLog('Generating AI summary...'); // Reduce log noise
			const response = await this.genAI.models.generateContent({
				model: 'gemini-2.0-flash',
				contents: prompt,
			});

			const summary = response.text;
			// debugLog('AI summary generated successfully'); // Reduce log noise

			const stats = fs.statSync(absolutePath);
			let hash = undefined;
			try {
				hash = (await this.git.revparse(['HEAD'])).trim() || undefined;
			} catch (gitError) {
				debugLog(`Could not get git hash: ${gitError}`);
			}

			const doc: FileDocumentation = {
				path: normalizedRelativePath,
				lastUpdated: new Date().toISOString(),
				summary: summary || '(No summary generated)',
				type: fileType,
				hash: hash,
				preview: this.getFilePreview(absolutePath),
				lastModified: stats.mtimeMs, // Store file modification time
			};

			this.projectDocs.files[normalizedRelativePath] = doc;

			// Save individual file documentation
			const safeBaseName = normalizedRelativePath.replace(/[\/\\]/g, '_'); // Ensure safe name
			const fileDocPath = path.join(
				this.docsPath,
				'files',
				`${safeBaseName}.json`,
			);
			// debugLog(`Saving individual file documentation to: ${fileDocPath}`); // Reduce log noise
			try {
				fs.mkdirSync(path.dirname(fileDocPath), {recursive: true});
				fs.writeFileSync(fileDocPath, JSON.stringify(doc, null, 2));
			} catch (writeError) {
				debugLog(
					`Error writing individual doc file ${fileDocPath}: ${writeError}`,
				);
			}

			this.debounceSave(); // Trigger save for the main docs.json
			// debugLog(`Documentation generated successfully for: ${normalizedRelativePath}`); // Reduce log noise
			return doc;
		} catch (error) {
			debugLog(
				`Error generating documentation for ${normalizedRelativePath}: ${error}`,
			);
			throw error; // Re-throw for queue processor
		}
	}

	/**
	 * Removes documentation for a given file path.
	 */
	removeDocumentation(relativePath: string): void {
		const normalizedRelativePath = this.normalizePath(relativePath);
		if (this.projectDocs.files[normalizedRelativePath]) {
			debugLog(
				`Removing documentation entry for deleted file: ${normalizedRelativePath}`,
			);
			delete this.projectDocs.files[normalizedRelativePath];

			// Remove individual file
			const safeBaseName = normalizedRelativePath.replace(/[\/\\]/g, '_');
			const fileDocPath = path.join(
				this.docsPath,
				'files',
				`${safeBaseName}.json`,
			);
			if (fs.existsSync(fileDocPath)) {
				try {
					fs.unlinkSync(fileDocPath);
				} catch (unlinkError) {
					debugLog(
						`Error removing individual doc file ${fileDocPath}: ${unlinkError}`,
					);
				}
			}
			this.debounceSave();
		}
	}

	/**
	 * Generates an HTML report from the current documentation.
	 */
	async generateHtml() {
		// Optional: Wait for queue to finish before generating HTML
		// while (this.isProcessingQueue || this.processingQueue.length > 0) {
		//     debugLog("Waiting for documentation queue before generating HTML...");
		//     await new Promise(resolve => setTimeout(resolve, 1000));
		// }
		debugLog('Generating HTML documentation...');

		const template = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Project Documentation</title>
            <style>
                body { font-family: system-ui; max-width: 1200px; margin: 0 auto; padding: 20px; }
                .file { margin-bottom: 30px; border: 1px solid #eee; padding: 20px; border-radius: 8px; }
                pre { background: #f6f8fa; padding: 15px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
                .summary { margin: 15px 0; padding: 15px; background: #f0f7ff; border-radius: 6px; }
                h2 { word-break: break-all; }
            </style>
        </head>
        <body>
            <h1>Project Documentation</h1>
            <p>Last updated: ${new Date(
							this.projectDocs.lastUpdated,
						).toLocaleString()}</p>
            ${Object.values(this.projectDocs.files)
							.sort((a, b) => a.path.localeCompare(b.path))
							.map(
								file => `
                <div class="file">
                    <h2>${file.path}</h2>
                    <div class="summary">
                        <h3>Summary</h3>
                        <p>${file.summary.replace(/\n/g, '<br/>')}</p>
                    </div>
                    <h3>Source Code Preview</h3>
                    <pre><code>${file.preview
											.replace(/</g, '&lt;')
											.replace(/>/g, '&gt;')}</code></pre>
                    <p><small>File Last Modified: ${new Date(
											file.lastModified,
										).toLocaleString()}<br>Docs Last Updated: ${new Date(
									file.lastUpdated,
								).toLocaleString()}</small></p>
                </div>
            `,
							)
							.join('\n')}
        </body>
        </html>
        `;

		const htmlFilePath = path.join(this.htmlPath, 'index.html');
		try {
			fs.writeFileSync(htmlFilePath, template);
			debugLog(`Generated HTML documentation at ${htmlFilePath}`);
		} catch (error) {
			debugLog(`Error generating HTML file: ${error}`);
		}
	}

	/**
	 * Retrieves documentation for a specific file from the in-memory store.
	 */
	getDocumentation(filePath: string): FileDocumentation | undefined {
		const relativePath = this.normalizePath(filePath);
		return this.projectDocs.files[relativePath];
	}

	getFileHash(filePath: string): string {
		const relativePath = this.normalizePath(filePath);
		const docs = this.projectDocs.files[relativePath];
		return docs?.hash || '';
	}

	/**
	 * Queues a file for documentation update.
	 */
	async updateDocumentation(filePath: string): Promise<void> {
		const relativePath = this.normalizePath(filePath);
		this.addToQueue(relativePath);
	}

	/**
	 * Triggers a full regeneration of all documentation by queueing all relevant files.
	 */
	async regenerateAllDocs(): Promise<{
		total: number;
		queued: number;
		skipped: number;
	}> {
		debugLog(
			'Manually triggered full documentation regeneration (force regenerate)',
		);
		const previousQueueSize = this.processingQueue.length;
		this.processingQueue = []; // Clear queue immediately
		debugLog(
			`Cleared ${previousQueueSize} items from the queue for forced regeneration.`,
		);
		return this.generateAllDocsForWorkspace(true); // Re-scan and queue all
	}
}

// Debounce function (keep as is)
function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number,
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout | null = null;
	return function executedFunction(...args: Parameters<T>) {
		const later = () => {
			timeout = null;
			func(...args);
		};
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(later, wait);
	};
}
