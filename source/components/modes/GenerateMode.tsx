import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
	useInput,
	Box,
	Text,
	measureElement,
	DOMElement,
	useStdout, // Import useStdout hook
} from 'ink';
import clipboard from 'clipboardy';
import * as path from 'path';
import * as fs from 'fs';

import {DocManager} from '../../services/DocManager.js';
import {FileDocumentation, FileNode} from '../../types/docs.js';
import {LoadingCat} from '../LoadingCat.js';
import {FileTree} from '../FileTree.js'; // Assuming FileTree can handle height constraints
import {getDebugMode} from '../../services/ConfigMangagement.js';
// Removed StdoutContext import

// --- Debug Logging (Keep as is) ---
const DEBUG = getDebugMode();
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'catdoc-debug.log');
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
// --- Helper Constants (Keep as is) ---
const IGNORED_DIRS = new Set([
	'node_modules',
	'dist',
	'.git',
	'coverage',
	'.next',
	'.cache',
	'docs',
]);
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

// --- Helper Functions (Keep isCommonFile, getFilePreview) ---
const isCommonFile = (filename: string): boolean => {
	const ext = path.extname(filename).toLowerCase();
	const basename = path.basename(filename);
	return COMMON_FILES.has(ext) || COMMON_FILES.has(basename);
};

const getFilePreview = (
	workspacePath: string,
	relativeFilePath: string,
	maxLines: number = 10,
): string => {
	try {
		const absolutePath = path.resolve(workspacePath, relativeFilePath);
		// debugLog(`Attempting to read file preview: ${absolutePath}`); // Keep logs minimal unless debugging specific issues
		if (!fs.existsSync(absolutePath)) {
			// debugLog(`File does not exist for preview: ${absolutePath}`);
			return 'File does not exist';
		}
		const content = fs.readFileSync(absolutePath, 'utf-8');
		const lines = content.split('\n');
		const limitedLines = lines.slice(0, maxLines);

		const previewText =
			limitedLines.join('\n') + (lines.length > maxLines ? '\n...' : '');

		// Simple vertical limit based on lines (less precise than measuring)
		const terminalHeightApproximation = 20; // Fine-tune this estimate
		const previewLines = previewText.split('\n');
		if (previewLines.length > terminalHeightApproximation) {
			return (
				previewLines.slice(0, terminalHeightApproximation).join('\n') +
				'\n[...]' // Indicate truncation
			);
		}
		return previewText;
	} catch (error: any) {
		debugLog(
			`Error reading file preview ${relativeFilePath} (resolved: ${path.resolve(
				workspacePath,
				relativeFilePath,
			)}): ${error}`,
		);
		return `Unable to read file content: ${error?.message || 'Unknown error'}`;
	}
};

// --- Component ---
export const GenerateMode: React.FC<{
	workspacePath: string;
	onBack: () => void;
}> = ({workspacePath, onBack}) => {
	const [fileStructure, setFileStructure] = useState<FileNode | null>(null);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [selectedFileDoc, setSelectedFileDoc] =
		useState<FileDocumentation | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [loadingMessage, setLoadingMessage] = useState('Initializing...');
	const [copySuccess, setCopySuccess] = useState<boolean>(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null); // For temporary messages

	const docManagerRef = useRef<DocManager | null>(null);
	if (!docManagerRef.current) {
		docManagerRef.current = new DocManager(workspacePath);
	}
	const docManager = docManagerRef.current;

	// Get terminal dimensions using the hook
	const {stdout} = useStdout(); // Use the hook here
	const terminalHeight = stdout?.rows ?? 24; // Default height if not available
	const terminalWidth = stdout?.columns ?? 80; // Default width

	// Refs for measuring element heights
	const headerRef = useRef<DOMElement>(null);
	const [headerHeight, setHeaderHeight] = useState(0);

	// Measure header height after render
	useEffect(() => {
		if (headerRef.current) {
			const measurement = measureElement(headerRef.current);
			setHeaderHeight(measurement.height);
		}
	}, [terminalWidth]); // Re-measure if width changes (wrapping might affect height)

	const handleCopy = useCallback(async () => {
		if (selectedFileDoc?.summary && !selectedFileDoc.summary.startsWith('(')) {
			try {
				await clipboard.write(selectedFileDoc.summary);
				setCopySuccess(true);
				setStatusMessage('✓ Summary Copied!');
				setTimeout(() => {
					setCopySuccess(false);
					setStatusMessage(null);
				}, 2000);
			} catch (err) {
				debugLog(`Error copying to clipboard: ${err}`);
				setError('Failed to copy to clipboard.');
				setCopySuccess(false);
				setStatusMessage(null);
			}
		} else {
			setStatusMessage('Nothing actionable to copy.');
			setTimeout(() => setStatusMessage(null), 2000);
		}
	}, [selectedFileDoc]);

	const refreshSelectedFile = useCallback(async () => {
		if (selectedFile) {
			setLoadingMessage(`Refreshing ${path.basename(selectedFile)}...`);
			setError(null);
			setStatusMessage(null);
			try {
				// Update documentation (returns void)
				await docManager.updateDocumentation(selectedFile);
				// THEN get the updated documentation
				const updatedDoc = docManager.getDocumentation(selectedFile);
				setSelectedFileDoc(updatedDoc || null); // Update state with the fetched doc

				setStatusMessage(`✓ ${path.basename(selectedFile)} refreshed.`);
				setTimeout(() => setStatusMessage(null), 2500);
				debugLog(`Manual refresh successful for ${selectedFile}`);
			} catch (err) {
				debugLog(`Error during manual refresh for ${selectedFile}: ${err}`);
				const errorMsg = err instanceof Error ? err.message : 'Unknown error';
				setError(`Failed to refresh: ${errorMsg}`);
				setStatusMessage(null);
			} finally {
				setLoadingMessage('');
			}
		} else {
			setStatusMessage('Select a file to refresh.');
			setTimeout(() => setStatusMessage(null), 2000);
		}
	}, [selectedFile, docManager]); // docManager added as dependency

	useInput(async (input, key) => {
		if (key.ctrl && input.toLowerCase() === 'b') {
			onBack();
		} else if (key.shift && input.toUpperCase() === 'C') {
			await handleCopy(); // Ensure await if handleCopy becomes async
		} else if (key.ctrl && input.toUpperCase() === 'R') {
			await refreshSelectedFile();
		}
	});

	// Effect for Initial Scan
	useEffect(() => {
		let isMounted = true;
		async function initializeUI() {
			if (!isMounted) return;
			setIsLoading(true);
			setError(null);
			setFileStructure(null);
			setSelectedFile(null);
			setSelectedFileDoc(null);
			setLoadingMessage('Scanning project files...');
			debugLog('=== Initializing GenerateMode UI & Watcher ===');
			debugLog(`Workspace path: ${workspacePath}`);
			debugLog(`Terminal dimensions: ${terminalWidth}x${terminalHeight}`);

			try {
				if (!fs.existsSync(workspacePath)) {
					throw new Error(`Workspace path not found: ${workspacePath}`);
				}
				// Pass DocManager instance for watcher setup and potentially initial checks
				const uiStructure = readDirectoryForUI(workspacePath, 0, docManager);

				if (!uiStructure || uiStructure.name.includes('(error)')) {
					const errMsg = uiStructure?.documentation || 'Check logs.';
					debugLog(
						`Workspace scan resulted in an empty or errored structure for ${workspacePath}`,
					);
					if (isMounted)
						setError(
							`Failed to read workspace or it's empty/ignored: ${errMsg}`,
						);
				} else if (
					uiStructure.type === 'directory' &&
					(!uiStructure.children || uiStructure.children.length === 0)
				) {
					debugLog(
						`Workspace scan complete, but no relevant files found for ${workspacePath}`,
					);
					if (isMounted)
						setError(
							`No relevant files found. Check IGNORED_DIRS, INTERESTING_EXTENSIONS, or hidden files ('.').`,
						); // Set error state
					// Set structure anyway to potentially show the root? Or leave it null?
					// Let's leave it null and rely on the error message.
				} else {
					debugLog(`File scan for UI completed.`);
					if (isMounted) setFileStructure(uiStructure);
				}
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : 'Failed to scan workspace';
				const finalError = `Initialization Error: ${errorMsg}`;
				debugLog(`Error during UI initialization: ${err}`);
				if (isMounted) setError(finalError);
			} finally {
				if (isMounted) {
					setIsLoading(false);
					setLoadingMessage('');
					debugLog('=== GenerateMode UI Initialization finished ===');
				}
			}
		}
		initializeUI();
		return () => {
			isMounted = false;
			debugLog('GenerateMode unmounting.');
			// Consider if DocManager watcher needs cleanup here
			// docManagerRef.current?.closeWatcher(); // Example if DocManager has cleanup
		};
	}, [workspacePath, docManager, terminalHeight, terminalWidth]); // Rerun if path or terminal size changes

	// Handle File Selection
	const handleFileSelect = useCallback(
		async (relativeFilePathFromTree: string) => {
			setSelectedFile(relativeFilePathFromTree);
			setCopySuccess(false);
			setError(null); // Clear file-specific error
			setStatusMessage(null);
			setSelectedFileDoc(null); // Clear previous doc
			setLoadingMessage(
				`Loading ${path.basename(relativeFilePathFromTree)}...`,
			);

			// Correct path if it includes workspace basename from tree structure
			let correctedRelativePath = relativeFilePathFromTree;
			const workspaceBaseName = path.basename(workspacePath);
			if (
				correctedRelativePath.startsWith(workspaceBaseName + path.sep) ||
				correctedRelativePath.startsWith(workspaceBaseName + '/')
			) {
				correctedRelativePath = correctedRelativePath.substring(
					workspaceBaseName.length + 1,
				);
			}
			const relativePath = correctedRelativePath.replace(/\\/g, '/'); // Use consistent slashes
			const absolutePath = path.resolve(workspacePath, relativePath);
			// Dynamically adjust preview lines based on calculated available space
			const previewHeaderFooterEstimate = 10; // Lines used by surrounding UI elements in details pane
			const maxPreviewLines = Math.max(
				5,
				contentHeight - previewHeaderFooterEstimate,
			);

			try {
				if (!fs.existsSync(absolutePath)) {
					throw new Error(`File not found: ${relativePath}`);
				}

				if (isCommonFile(relativePath)) {
					debugLog(`Common file selected: ${relativePath}`);
					const preview = getFilePreview(
						workspacePath,
						absolutePath,
						maxPreviewLines, // Use calculated max lines
					);
					setSelectedFileDoc({
						path: relativePath,
						summary: '(Common file type - preview only)',
						preview: preview,
						lastModified: fs.statSync(absolutePath).mtimeMs, // Get actual mtime
						type: path.extname(relativePath).slice(1),
						lastUpdated: '', // Not applicable
						content: '', // Don't store full content for common files
					});
					setLoadingMessage('');
					return;
				}

				let doc = docManager.getDocumentation(relativePath);
				let generatedNow = false;
				let fileMtime = 0;

				try {
					const stats = await fs.promises.stat(absolutePath);
					fileMtime = stats.mtimeMs; // Store mtime

					if (doc && fileMtime > doc.lastModified) {
						debugLog(
							`FILE CHANGED (mtime check): ${relativePath}. Triggering update.`,
						);
						setLoadingMessage(
							`Updating documentation for ${path.basename(relativePath)}...`,
						);
						// Perform update (returns void)
						await docManager.updateDocumentation(relativePath);
						// Fetch the updated doc
						doc = docManager.getDocumentation(relativePath);
						generatedNow = true; // Treat as newly generated for preview logic
					}
				} catch (statError) {
					debugLog(
						`Error stating file during check ${relativePath}: ${statError}`,
					);
					setError(
						`Could not verify file status: ${
							statError instanceof Error ? statError.message : statError
						}`,
					);
					// Proceed with potentially stale doc if available
				}

				if (!doc) {
					// No documentation exists, generate it now
					debugLog(
						`No cached documentation for: ${relativePath}. Generating...`,
					);
					setLoadingMessage(
						`Generating documentation for ${path.basename(relativePath)}...`,
					);
					doc = await docManager.generateDocumentation(relativePath);
					generatedNow = true;
				}

				// Ensure preview is generated if needed (and doc exists)
				if (doc && (!doc.preview || generatedNow)) {
					doc.preview = getFilePreview(
						workspacePath,
						absolutePath,
						maxPreviewLines,
					);
				}
				// Ensure lastModified is up-to-date in the doc object state
				if (doc && fileMtime) {
					doc.lastModified = fileMtime;
				}

				// Update the state with the final doc object
				setSelectedFileDoc(
					doc || {
						// Fallback structure if generation failed entirely
						path: relativePath,
						summary: '(Failed to generate or load documentation)',
						preview: getFilePreview(
							workspacePath,
							absolutePath,
							maxPreviewLines,
						),
						lastModified: fileMtime || 0,
						lastUpdated: '',
						type: path.extname(relativePath).slice(1),
						content: '', // Avoid storing large content on failure
					},
				);
			} catch (err) {
				const errorMsg =
					err instanceof Error ? err.message : 'Failed to load file details';
				debugLog(
					`Error during file selection processing for ${relativePath}: ${err}`,
				);
				setError(`Error loading ${relativePath}: ${errorMsg}`); // Set file-specific error
				setSelectedFileDoc(null); // Clear doc on error
			} finally {
				setLoadingMessage(''); // Clear loading message
			}
		},
		// Recalculate available height based on terminalHeight and headerHeight
		[workspacePath, docManager, terminalHeight, headerHeight],
	);

	// --- Calculate Heights ---
	const footerHeight = 2; // Reserve lines for footer/instructions etc.
	const availableHeight = Math.max(
		1,
		terminalHeight - headerHeight - footerHeight,
	); // Height for the two main panes + borders
	const contentHeight = Math.max(1, availableHeight - 2); // Subtract ~2 for pane borders/padding

	// --- Rendering Logic ---

	if (isLoading) {
		return (
			<Box
				height={terminalHeight}
				width={terminalWidth}
				alignItems="center"
				justifyContent="center"
			>
				<LoadingCat message={loadingMessage} />
			</Box>
		);
	}

	// Handle Initialization Error or Empty Workspace
	if (error && !isLoading && !fileStructure) {
		// If there was an error and we never got a file structure
		return (
			<Box
				flexDirection="column"
				height={terminalHeight}
				padding={1}
				borderStyle="round"
				borderColor="red"
				alignItems="center"
				justifyContent="center"
			>
				<Text color="red" bold>
					Error Initializing View
				</Text>
				<Text color="red" wrap="wrap">
					{error}
				</Text>
				<Box marginTop={1}>
					<Text>Press Ctrl+B to go back.</Text>
					<Text dimColor> (Check catdoc-debug.log for details)</Text>
				</Box>
			</Box>
		);
	}
	// If loading finished but structure is still null/empty (should be caught by error above now)
	if (!fileStructure) {
		return (
			<Box
				flexDirection="column"
				height={terminalHeight}
				padding={1}
				borderStyle="round"
				borderColor="yellow"
				alignItems="center"
				justifyContent="center"
			>
				<Text color="yellow">
					Workspace scan complete, but no displayable files found.
				</Text>
				<Text color="gray" wrap="wrap">
					This might be due to file types, ignored directories (node_modules,
					.git, dist, etc.), or hidden files/folders.
				</Text>
				<Box marginTop={1}>
					<Text>Press Ctrl+B to go back.</Text>
				</Box>
			</Box>
		);
	}

	// --- Main UI Rendering ---
	return (
		<Box
			flexDirection="column"
			width={terminalWidth}
			height={terminalHeight}
			overflow="hidden" // Prevent container overflow
		>
			{/* Header Section */}
			<Box
				ref={headerRef} // Measured ref
				flexDirection="column"
				borderStyle="single"
				borderColor="blue"
				paddingX={1}
				marginBottom={1} // Space between header and content panes
				flexShrink={0}
			>
				<Box justifyContent="space-between">
					<Text bold color="blue">
						Catdoc Browser
					</Text>
					{/* Truncate long paths */}
					<Text dimColor>
						{workspacePath.length > terminalWidth - 25
							? '...' + workspacePath.slice(-(terminalWidth - 28))
							: workspacePath}
					</Text>
				</Box>
				<Box justifyContent="space-between" alignItems="center">
					<Text dimColor>(Ctrl+B: Back | Ctrl+R: Refresh | Shift+C: Copy)</Text>
					{/* Status message area */}
					<Box minWidth={20} justifyContent="flex-end">
						{statusMessage ? (
							<Text color={copySuccess ? 'green' : 'yellow'}>
								{statusMessage}
							</Text>
						) : (
							<Text> </Text> // Placeholder
						)}
					</Box>
				</Box>
			</Box>

			{/* Main Content Area (File Tree + Details) */}
			<Box
				flexGrow={1} // Takes up remaining vertical space
				flexDirection="row" // Panes side-by-side
				height={availableHeight} // Use calculated height
				overflow="hidden" // Clip children if they overflow this box
			>
				{/* Left Pane: File Tree */}
				<Box
					width="40%"
					height="100%" // Fill row height
					borderStyle="round"
					borderColor="cyan"
					marginRight={1}
					overflow="hidden" // Contain FileTree within borders
					padding={0} // Let FileTree handle its internal padding
					flexDirection="column" // Ensure FileTree flows correctly if needed
				>
					{/* FileTree needs 'height' prop added to its definition */}
					{/* And needs internal scrolling based on that height */}
					<FileTree
						files={fileStructure}
						onSelect={handleFileSelect}
						selectedFile={selectedFile}
						height={contentHeight} // Pass calculated content height
					/>
				</Box>

				{/* Right Pane: Details / Loading / Error */}
				<Box
					width="60%"
					height="100%" // Fill row height
					borderStyle="round"
					borderColor="gray"
					padding={1}
					flexDirection="column" // Content flows top-to-bottom
					overflow="hidden" // Hide overflow within this pane
				>
					{/* Conditional Rendering for Right Pane */}
					{/* Show loading message only when actively processing a selection */}
					{loadingMessage && selectedFile ? (
						<Box flexGrow={1} alignItems="center" justifyContent="center">
							<LoadingCat message={loadingMessage} isRunning={true} />
						</Box>
					) : // Show file-specific error (cleared on new selection)
					error && selectedFile ? (
						<Box flexGrow={1}>
							<Text color="red" bold>
								Error:
							</Text>
							<Text color="red" wrap="wrap">
								{error}
							</Text>
						</Box>
					) : // Initial state or after deselecting/error clearing
					!selectedFile ? (
						<Box flexGrow={1} alignItems="center" justifyContent="center">
							<Text dimColor>
								Select a file from the tree to view documentation.
							</Text>
						</Box>
					) : // Display Documentation Details
					selectedFileDoc ? (
						<Box flexDirection="column" flexGrow={1} overflow="hidden">
							<Text bold>File: {path.basename(selectedFileDoc.path)}</Text>
							<Box marginTop={1} flexDirection="column" flexShrink={0}>
								<Text bold>Summary:</Text>
								<Box
									borderStyle="round"
									borderColor={
										selectedFileDoc.summary?.startsWith('(') ? 'yellow' : 'gray'
									}
									paddingX={1}
									marginY={1}
									height={Math.max(5, contentHeight - 15)} // Use height instead of maxHeight
									overflow="hidden"
								>
									<Text wrap="wrap">
										{selectedFileDoc.summary || '(No summary available)'}
									</Text>
								</Box>
							</Box>
							{/* Preview takes remaining space */}
							<Box
								marginTop={1}
								flexDirection="column"
								flexGrow={1}
								minHeight={5}
							>
								<Text bold>Preview:</Text>
								<Box
									borderStyle="round"
									borderColor="gray"
									paddingX={1}
									marginTop={1}
									flexGrow={1} // Use remaining space
									overflow="hidden" // Hide overflow within the preview box
								>
									{/* Truncate ensures it fits horizontally, height constraint handled by parent */}
									<Text dimColor wrap="truncate-end">
										{selectedFileDoc.preview || '(No preview available)'}
									</Text>
								</Box>
							</Box>
							{/* Footer info */}
							<Box
								marginTop={1}
								flexDirection="row"
								justifyContent="space-between"
								flexShrink={0}
							>
								<Text dimColor>
									Modified:{' '}
									{selectedFileDoc.lastModified
										? new Date(selectedFileDoc.lastModified).toLocaleString()
										: 'N/A'}
								</Text>
								<Text dimColor>
									Docs Updated:{' '}
									{selectedFileDoc.lastUpdated
										? new Date(selectedFileDoc.lastUpdated).toLocaleString()
										: 'N/A'}
								</Text>
							</Box>
						</Box>
					) : (
						// Fallback if selected but somehow no doc/error/loading
						<Box flexGrow={1} alignItems="center" justifyContent="center">
							<Text dimColor>
								Loading details for {path.basename(selectedFile)}...
							</Text>
						</Box>
					)}
				</Box>
			</Box>
		</Box>
	);
};

// --- Recursive Directory Scanner (Keep as is) ---
const readDirectoryForUI = (
	dirPath: string,
	level = 0,
	docManager: DocManager,
	processedDirs: Set<string> = new Set(),
): FileNode | null => {
	// Explicitly return null possibility
	const absoluteDirPath = path.resolve(dirPath);
	const name = path.basename(absoluteDirPath);
	// Ensure relative path is calculated correctly and consistently
	let relativePath = path
		.relative(docManager.workspacePath, absoluteDirPath)
		.replace(/\\/g, '/');
	// For the root directory itself, relative path is often '', use '.' or name?
	// The 'path' property in FileNode should represent its unique key in the structure
	const nodePathKey = relativePath || '.'; // Use '.' for root

	if (processedDirs.has(absoluteDirPath)) {
		debugLog(`Symlink loop detected involving: ${absoluteDirPath}`);
		// Return a node indicating the loop, but might be better to return null
		return {
			name: `${name} (symlink loop)`,
			type: 'file', // Treat as non-navigable leaf
			documentation: 'Symbolic link loop detected',
			path: nodePathKey, // Use the calculated key
		};
	}

	try {
		const stats = fs.statSync(absoluteDirPath);

		if (stats.isSymbolicLink()) {
			const targetPath = fs.realpathSync(absoluteDirPath);
			if (processedDirs.has(targetPath)) {
				debugLog(
					`Symlink loop detected targeting ${targetPath} from ${absoluteDirPath}`,
				);
				return {
					name: `${name} (symlink loop)`,
					type: 'file',
					documentation: `Symbolic link loop detected targeting ${targetPath}`,
					path: nodePathKey,
				};
			}
			// Note: Following symlinks into directories could be complex if they point outside
			// For now, let's rely on statSync following the link if it points within workspace.
		}

		processedDirs.add(absoluteDirPath); // Mark as visited *for this branch*

		if (stats.isDirectory()) {
			if (
				IGNORED_DIRS.has(name) ||
				(name.startsWith('.') && name !== '.' && name !== '..') ||
				name === 'docs'
			) {
				debugLog(`Ignoring directory: ${nodePathKey}`);
				return null; // Filter out ignored directory entirely
			}

			// Watch the directory (DocManager should handle recursive watching)
			docManager.watchDirectory(absoluteDirPath);

			let items: string[];
			try {
				items = fs.readdirSync(absoluteDirPath);
			} catch (readDirError: any) {
				debugLog(`Error reading directory ${absoluteDirPath}: ${readDirError}`);
				// Return node indicating error, or null? Let's return null to simplify tree.
				// We log the error anyway.
				// return { name: `${name} (read error)`, type: 'directory', children: [], documentation: `Error: ${readDirError.message}`, path: nodePathKey };
				return null;
			}

			const children: FileNode[] = items
				.map(item => {
					const fullPath = path.resolve(absoluteDirPath, item);
					// Recursive call MUST use the correctly resolved fullPath
					// Pass a *copy* of the processedDirs set for each branch
					return readDirectoryForUI(
						fullPath,
						level + 1,
						docManager,
						new Set(processedDirs),
					);
				})
				.filter((child): child is FileNode => child !== null); // Filter out null results (ignored/errored items)

			// Only return directory node if it has *valid* children after filtering
			return children.length > 0
				? {
						name,
						type: 'directory',
						children,
						path: nodePathKey, // Use consistent key
				  }
				: null; // Filter out empty directories
		} else if (stats.isFile()) {
			const ext = path.extname(name).toLowerCase();
			// Filter files: Not hidden AND (interesting extension OR common file)
			if (
				!name.startsWith('.') &&
				(INTERESTING_EXTENSIONS.has(ext) ||
					COMMON_FILES.has(ext) ||
					COMMON_FILES.has(name))
			) {
				return {name, type: 'file', path: nodePathKey}; // Use consistent key
			} else {
				return null; // Filter out non-interesting/hidden files
			}
		} else {
			// Ignore sockets, block devices, etc.
			debugLog(
				`Ignoring unsupported file system type: ${nodePathKey} (${name})`,
			);
			return null;
		}
	} catch (error: any) {
		// Handle errors during stat or other operations
		debugLog(
			`Error processing path ${absoluteDirPath} (key: ${nodePathKey}): ${error}`,
		);
		// Represent error in the node, or filter out? Let's filter out for cleaner UI.
		// return { name: `${name} (access error)`, type: 'file', documentation: `Error: ${error.message}`, path: nodePathKey };
		return null;
	} finally {
		// No cleanup needed for processedDirs here since copies are passed down
	}
};
