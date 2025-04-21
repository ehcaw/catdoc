import React, {useState, useCallback, useEffect} from 'react';
import {useInput, Box, Text} from 'ink';
import Parser from 'tree-sitter';
import clipboard from 'clipboardy';
import * as path from 'path';
import * as fs from 'fs';

import {DocManager} from '../../services/DocManager.js';
import {FileNode} from '../../types/docs.js';
import {LoadingCat} from '../LoadingCat.js';
import {FileTree} from '../FileTree.js';
import {getDebugMode} from '../../services/ConfigMangagement.js';
import {
	loadCache,
	getDiffs,
	generateDirectoryTreeJson,
} from '../../services/treesitter.js';

export const GenerateMode: React.FC<{
	workspacePath: string;
	onBack: () => void;
}> = ({workspacePath, onBack}) => {
	const [fileStructure, setFileStructure] = useState<FileNode | null>(null);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [selectedFileContent, setSelectedFileContent] = useState<string | null>(
		null,
	);
	const [selectedFileDocs, setSelectedFileDocs] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [loadingMessage, setLoadingMessage] = useState('Initializing...');
	// Initialize DocManager with the absolute workspacePath passed as prop
	const [docManager] = useState(() => new DocManager(workspacePath));
	const [copySuccess, setCopySuccess] = useState<boolean>(false);

	// Add clipboard handler using a Node.js library
	const handleCopy = useCallback(async () => {
		if (selectedFileDocs) {
			try {
				await clipboard.write(selectedFileDocs); // Use clipboardy
				setCopySuccess(true);
			} catch (err) {
				debugLog(`Error copying to clipboard: ${err}`);
				setCopySuccess(false);
			}
		}
	}, [selectedFileDocs]);

	useInput((input, key) => {
		// Handle going back
		if (key.ctrl && input.toLowerCase() === 'b') {
			onBack();
		}
		// Handle copying documentation with Shift+C
		else if (key.shift && input.toUpperCase() === 'C') {
			if (
				selectedFileDocs &&
				selectedFileDocs !== '(Common file type - preview only)' &&
				selectedFileDocs !== '(No documentation generated yet)'
			) {
				handleCopy();
			}
		}
		// TODO: Add a keybind here to trigger documentation generation manually?
		// else if (key.shift && input.toUpperCase() === 'G') {
		//    triggerDocumentationGeneration(); // Need to implement this function
		// }
	});

	// This useEffect now only initializes the UI state and loads existing data
	// It should NOT modify source files.
	useEffect(() => {
		async function initializeUI() {
			setIsLoading(true);
			setError(null);
			setFileStructure(null);
			setLoadingMessage('Scanning project files...');
			debugLog('=== Initializing GenerateMode UI ===');
			// workspacePath prop is already resolved to absolute in App component
			debugLog(`Using workspace path: ${workspacePath}`);

			try {
				// Directly call readDirectoryForUI and check its result
				const uiStructure = readDirectoryForUI(workspacePath); // Pass the absolute path

				// Check if the root operation itself failed within readDirectoryForUI
				if (uiStructure.name.includes('(error)')) {
					// Extract the more detailed error from the node if available
					throw new Error(
						`Failed to read workspace root: ${
							uiStructure.documentation ||
							'Unknown error reading directory structure'
						}`,
					);
				}

				// Check if the structure is empty (might be valid, but good to log)
				if (
					uiStructure.type === 'directory' &&
					(!uiStructure.children || uiStructure.children.length === 0)
				) {
					debugLog(
						`Workspace scan resulted in an empty directory structure for ${workspacePath}`,
					);
				} else {
					debugLog(`File scan for UI completed successfully.`);
				}

				setFileStructure(uiStructure); // Set UI state
			} catch (err) {
				// This catch block will catch errors explicitly thrown above,
				// or potentially unexpected errors from deep within fs calls.
				const errorMsg =
					err instanceof Error ? err.message : 'Failed to scan workspace';
				// Format the error clearly for the UI
				const finalError = `Initialization Error: ${errorMsg}`;
				debugLog(`Error during UI initialization: ${err}`); // Log the full error object/stack
				setError(finalError); // Set the formatted error for display
			} finally {
				setIsLoading(false);
				setLoadingMessage(''); // Clear loading message
				debugLog('=== GenerateMode UI Initialization finished ===');
			}
		}

		// Ensure workspacePath is valid before initializing
		if (workspacePath && fs.existsSync(workspacePath)) {
			initializeUI();
		} else {
			setError(
				`Initialization Error: Workspace path not found or invalid: ${workspacePath}`,
			);
			setIsLoading(false);
		}
	}, [workspacePath]); // Only depends on workspacePath

	// Add this new effect that properly handles documentation generation
	useEffect(() => {
		async function generateDocumentation() {
			try {
				// First ensure tree is generated
				setLoadingMessage('Generating code tree...');
				const parser = new Parser();
				const cache = loadCache(workspacePath);
				const diffs = getDiffs(workspacePath, cache, []);
				await generateDirectoryTreeJson(workspacePath, parser, true, true);

				// Then find changed files
				setLoadingMessage('Finding changed files...');

				// Only proceed if there are changes
				if (diffs.length > 0) {
					setLoadingMessage(
						`Generating documentation for ${diffs.length} changed files...`,
					);
					debugLog(`Found ${diffs.length} changed files: ${diffs.join(', ')}`);

					// Generate documentation for each file
					await docManager.generateAllDocumentation(diffs);
					debugLog('Documentation generation complete');
				} else {
					debugLog('No changed files found, skipping documentation generation');
				}
			} catch (error) {
				debugLog(`Error in documentation generation: ${error}`);
				// Don't set error state here - we want the UI to still work
			}
		}

		// Only run if we have a valid workspace
		if (workspacePath && fs.existsSync(workspacePath)) {
			generateDocumentation();
		}
	}, [workspacePath, docManager]);

	useEffect(() => {
		if (copySuccess) {
			const timer = setTimeout(() => setCopySuccess(false), 2000);
			return () => clearTimeout(timer);
		}
		return () => {};
	}, [copySuccess]);

	const handleFileSelect = useCallback(
		async (filePath: string) => {
			// filePath received from FileTree is relative to the root displayed by FileTree
			setSelectedFile(filePath);
			setCopySuccess(false);
			setError(null);
			setSelectedFileContent(null);
			setSelectedFileDocs(null);

			// Fix path resolution issues by examining if the filePath overlaps with workspacePath
			let absolutePath;
			const workspaceBaseName = path.basename(workspacePath);

			// Check if filePath already contains the workspace base directory
			if (filePath.startsWith(workspaceBaseName + '/')) {
				// If the relative path already includes the workspace name, resolve from the parent directory
				absolutePath = path.resolve(path.dirname(workspacePath), filePath);
			} else {
				// Normal case - resolve directly from workspace path
				absolutePath = path.resolve(workspacePath, filePath);
			}
			debugLog(
				`File selected: Relative='${filePath}', Absolute='${absolutePath}'`,
			);

			try {
				// Basic check if the resolved path exists before reading
				if (!fs.existsSync(absolutePath)) {
					debugLog(`Selected file path does not exist: ${absolutePath}`);
					setError(`File not found: ${filePath}`);
					return;
				}

				// Extract the file name correctly based on workspace root
				// This is the key fix - don't use path.relative here
				let fileName = filePath;

				// If the path starts with workspace name, remove it to avoid duplication
				const workspaceMatch = new RegExp(`^${workspaceBaseName}/`);
				if (workspaceMatch.test(fileName)) {
					fileName = fileName.replace(workspaceMatch, '');
				}

				debugLog(`Using fileName: ${fileName} for documentation lookup`);

				// Handle common files - show preview
				if (isCommonFile(fileName)) {
					debugLog(`Reading common file preview: ${absolutePath}`);
					const preview = getFilePreview(absolutePath, 20);
					setSelectedFileContent(preview);
					setSelectedFileDocs('(Common file type - preview only)');
					return;
				}

				// For other files, try to get docs from DocManager using relative path
				const doc = docManager.getDocumentation(fileName);

				if (doc && doc.summary) {
					debugLog(`Documentation found for: ${fileName}`);
					setSelectedFileContent(
						doc.content || doc.preview || 'No content available',
					);
					setSelectedFileDocs(doc.summary);
				} else {
					debugLog(`No cached documentation for: ${fileName}. Generating...`);
					await docManager.generateDocumentation(fileName);
					const preview = getFilePreview(absolutePath, 15);
					setSelectedFileContent(preview);
					const updatedDoc = docManager.getDocumentation(fileName);
					setSelectedFileDocs(
						updatedDoc?.summary || 'No documentation generated yet',
					);
				}
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : 'Failed to load file details';
				debugLog(
					`Error during file selection processing for ${absolutePath}: ${err}`,
				);
				setError(`Error loading details for ${filePath}: ${errorMsg}`);
			}
		},
		[workspacePath, docManager],
	);

	if (error && !isLoading) {
		// Only show root initialization error if not loading
		return (
			<Box flexDirection="column">
				{/* Display the formatted error from state */}
				<Text color="red">{error}</Text>
				<Box marginTop={1}>
					<Text>Press Ctrl+B to go back to menu</Text>
				</Box>
			</Box>
		);
	}

	if (isLoading) {
		return <LoadingCat message={loadingMessage} />;
	}

	if (!fileStructure) {
		return (
			<Box>
				<Text color="yellow">Workspace scan failed or directory is empty.</Text>
				<Box marginTop={1}>
					<Text>Press Ctrl+B to go back to menu</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>Documentation Browser - {workspacePath}</Text>
				<Text> (Press Ctrl+B to go back)</Text>
				{copySuccess && <Text color="green"> ✓ Copied to clipboard!</Text>}
			</Box>
			<Box>
				<Box width="50%" marginRight={2}>
					<FileTree
						files={fileStructure} // Pass the root FileNode
						onSelect={handleFileSelect}
						selectedFile={selectedFile} // Pass relative path string
					/>
				</Box>
				<Box width="50%" flexDirection="column">
					{/* Right Pane Logic */}
					{!selectedFile && (
						<Text>Select a file from the tree to view details.</Text>
					)}
					{/* Show loading specifically when a file is selected but details aren't loaded yet */}
					{selectedFile && !selectedFileDocs && !error && (
						<Box marginY={1} alignItems="center">
							<LoadingCat
								message={`Loading details for ${path.basename(
									selectedFile,
								)}...`}
								isRunning={true}
							/>
						</Box>
					)}
					{/* Show file-specific error if one occurred during handleFileSelect */}
					{selectedFile && error && <Text color="red">{error}</Text>}
					{/* Show details only if docs are loaded (implies content is also potentially loaded) */}
					{selectedFile && selectedFileDocs && !error && (
						<>
							<Text bold>File: {path.basename(selectedFile)}</Text>
							{/* Documentation Section */}
							<Box marginTop={1} flexDirection="column">
								<Text bold>Documentation:</Text>
								<Box
									borderStyle="round"
									borderColor="gray"
									paddingX={1}
									marginY={1}
								>
									<Text>{selectedFileDocs}</Text>
								</Box>
								{selectedFileDocs && !selectedFileDocs.startsWith('(') && (
									<Text dimColor> (Press Shift+C to copy)</Text>
								)}
							</Box>
							{/* Preview/Content Section */}
							{selectedFileContent && (
								<Box marginTop={1} flexDirection="column">
									<Text bold>Preview/Content:</Text>
									<Box
										borderStyle="round"
										borderColor="gray"
										paddingX={1}
										marginY={1}
										height={15} // Use fixed height
										overflowY="hidden"
									>
										<Text dimColor>{selectedFileContent}</Text>
									</Box>
								</Box>
							)}
						</>
					)}
				</Box>
			</Box>
		</Box>
	);
};

// Helper function
const isCommonFile = (filename: string): boolean => {
	const ext = path.extname(filename).toLowerCase();
	const basename = path.basename(filename);
	return COMMON_FILES.has(ext) || COMMON_FILES.has(basename);
};

const DEBUG = getDebugMode();
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'catdoc-debug.log');

// Directories to ignore
const IGNORED_DIRS = new Set([
	'node_modules',
	'dist',
	'.git',
	'coverage',
	'.next',
	'.cache',
]);

// File extensions we're interested in (used by getAllFilesFromStructure)
const INTERESTING_EXTENSIONS = new Set([
	'.js',
	'.jsx',
	'.ts',
	'.tsx',
	'.py',
	'.rb',
	'.java',
	'.go',
	'.cpp',
	'.c',
	'.h',
	'.hpp',
	'.json',
	// '.md', // Generally don't auto-document markdown itself
	// '.txt', // Generally don't auto-document text files
]);

const COMMON_FILES = new Set([
	'.json',
	'.log',
	'.md',
	'.txt',
	'.yml',
	'.yaml',
	'.env',
	'.gitignore',
	'LICENSE',
	'README',
]);

const debugLog = (message: string) => {
	if (DEBUG) {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}] ${message}\n`;
		try {
			fs.appendFileSync(LOG_FILE, logMessage);
		} catch (error) {
			// Silently fail as we can't use console.log during Ink rendering
		}
	}
};

// This function provides the structure for the FileTree UI component
// It does NOT use tree-sitter and doesn't include detailed code items or hashes.
// This function provides the structure for the FileTree UI component
// It does NOT use tree-sitter and doesn't include detailed code items or hashes.
const readDirectoryForUI = (dirPath: string, level = 0): FileNode => {
	const indent = '  '.repeat(level);
	// Use the resolved absolute path internally for consistency
	const absoluteDirPath = path.resolve(dirPath);
	const name = path.basename(absoluteDirPath);

	try {
		const stats = fs.statSync(absoluteDirPath);

		if (stats.isDirectory()) {
			if (IGNORED_DIRS.has(name) || name === '.git') {
				return {name, type: 'directory', children: []};
			}

			const items = fs.readdirSync(absoluteDirPath);
			const children = items
				.map(item => {
					// Construct the full path using resolve to ensure it's absolute
					const fullPath = path.resolve(absoluteDirPath, item);
					if (item.startsWith('.')) return null; // Skip hidden files/dirs
					// Recursive call MUST use the correctly resolved fullPath
					return readDirectoryForUI(fullPath, level + 1);
				})
				.filter((child): child is FileNode => {
					// Filter logic
					if (child === null) return false;

					// For files, check if the extension is in INTERESTING_EXTENSIONS
					if (child.type === 'file') {
						const ext = path.extname(child.name).toLowerCase();
						return INTERESTING_EXTENSIONS.has(ext);
					}

					// For directories, keep only those with children
					if (child.type === 'directory') {
						return Array.isArray(child.children) && child.children.length > 0;
					}

					return false;
				});

			return {name, type: 'directory', children};
		} else if (stats.isFile()) {
			return {name, type: 'file'};
		} else {
			return {name: `${name} (unsupported type)`, type: 'file'};
		}
	} catch (error) {
		// Log the absolute path that failed
		debugLog(
			`${indent}Error reading UI structure for ${absoluteDirPath}: ${error}`,
		);
		// Include the absolute path in the error node documentation for clarity
		return {
			name: `${name} (error)`,
			type: 'file',
			documentation: `Error accessing ${absoluteDirPath}: ${error}`,
		};
	}
};

/**
 * Retrieves a preview of a file's content by reading the first N lines.
 * @param {string} filePath - The path to the file.
 * @param {number} [lines=10] - Max number of lines to preview.
 * @returns {string} A string containing the first N lines of the file, or an error message.
 */
const getFilePreview = (filePath: string, maxLines: number = 10): string => {
	try {
		// Use absolute path for reading
		const absolutePath = path.resolve(filePath);
		debugLog(`Attempting to read file preview: ${absolutePath}`);
		if (!fs.existsSync(absolutePath)) {
			debugLog(`File does not exist: ${absolutePath}`);
			return 'File does not exist';
		}
		const content = fs.readFileSync(absolutePath, 'utf-8');
		const lines = content.split('\n').slice(0, maxLines); // Get first N lines
		return lines.join('\n') + (lines.length >= maxLines ? '\n...' : '');
	} catch (error: any) {
		debugLog(
			`Error reading file ${filePath} (resolved: ${path.resolve(
				filePath,
			)}): ${error}`,
		);
		return `Unable to read file content: ${error?.message || 'Unknown error'}`;
	}
};
