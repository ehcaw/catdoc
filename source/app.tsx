import React, {useState} from 'react';
import {useInput, useApp} from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import {Menu, MenuOption} from './components/Menu.js';
import Tutorial from './components/modes/TutorialMode.js';
import {GenerateMode} from './components/modes/GenerateMode.js';
import {ChatMode} from './components/modes/ChatMode.js';
import {ConfigMode} from './components/modes/ConfigMode.js';
import {FileNode} from './types/docs.js';
import {
	apiKey,
	gitignoreCatdocDirectories,
} from './services/ConfigMangagement.js';
import {ConfigError} from './components/ConfigError.js';

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

const DEBUG = true;
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'catdoc-debug.log');

// Initialize logging first
try {
	// Create logs directory if it doesn't exist
	if (!fs.existsSync(LOGS_DIR)) {
		fs.mkdirSync(LOGS_DIR, {recursive: true});
	}
	// Clear/create the log file
	fs.writeFileSync(
		LOG_FILE,
		`=== New Session Started at ${new Date().toISOString()} ===\n`,
	);
} catch (error) {
	console.error('Failed to initialize logging:', error);
}

/**
 * Logs a debug message to the log file if DEBUG is true.
 * @param {string} message - The message to log.
 * @returns {void}
 */
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

debugLog('Logging system initialized');

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
 * Interface defining the props for the App component.
 */
interface AppProps {
	/**
	 * The workspace path to display documentation for. Defaults to the current working directory.
	 */
	path?: string;
}

/**
 * Main application component that displays a file tree and documentation for selected files.
 * @param {AppProps} props - The props for the component, including the workspace path.
 * @returns {JSX.Element} The rendered component.
 */
const App: React.FC<AppProps> = ({path: initialPath = process.cwd()}) => {
	// Resolve the initial path to an absolute path ONCE.
	const workspacePath = path.resolve(initialPath);
	debugLog(`Resolved workspace path: ${workspacePath}`);

	const [activeMode, setActiveMode] = useState<MenuOption | null>(null);
	const {exit} = useApp();

	const handleMenuSelect = (option: MenuOption) => {
		setActiveMode(option);
	};

	const handleBack = () => {
		setActiveMode(null);
	};

	useInput((input, key) => {
		if (activeMode === null && key.ctrl && input.toLowerCase() === 'c') {
			exit();
		}
	});

	if (activeMode === null) {
		return <Menu onSelect={handleMenuSelect} />;
	}

	gitignoreCatdocDirectories(initialPath);

	switch (activeMode) {
		case 'generate':
			// Pass the consistently resolved absolute path
			if (!apiKey) {
				return <ConfigError onBack={handleBack} />;
			}
			return <GenerateMode workspacePath={workspacePath} onBack={handleBack} />;
		case 'chat':
			return <ChatMode onBack={handleBack} />;
		case 'config':
			return <ConfigMode onBack={handleBack} />;
		case 'tutorial':
			return <Tutorial onBack={handleBack} />;
		default:
			debugLog(`Invalid mode encountered: ${activeMode}. Returning to menu.`);
			setActiveMode(null);
			return <Menu onSelect={handleMenuSelect} />;
	}
};

/**
 * Helper function to get all files from the file structure recursively.
 * Returns relative paths based on the initial node.
 */
const getAllFilesFromStructure = (
	node: FileNode,
	currentRelativePath = '', // Start with empty relative path
): string[] => {
	// Build the relative path for the current node
	const nodePath = currentRelativePath
		? path.join(currentRelativePath, node.name)
		: node.name;

	if (node.type === 'file') {
		// Only return the path if it's likely a code file we can document
		// This prevents trying to document things like LICENSE, .json, etc.
		const ext = path.extname(node.name).toLowerCase();
		if (
			INTERESTING_EXTENSIONS.has(ext) &&
			!COMMON_FILES.has(ext) &&
			!COMMON_FILES.has(node.name) &&
			!node.name.startsWith('.')
		) {
			return [nodePath]; // Return the relative path
		} else {
			return []; // Don't include non-documentable files
		}
	}

	if (node.type === 'directory' && node.children) {
		// Recursively call for children, passing the current node's relative path
		return node.children.flatMap(child =>
			getAllFilesFromStructure(child, nodePath),
		);
	}

	return []; // Return empty array for empty directories or other cases
};

export default App;
