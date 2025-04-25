// catdoc/source/app.tsx
import React, {useState, useEffect} from 'react';
import {useInput, useApp, Box, Text, useStdout} from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import {Menu, MenuOption} from './components/Menu.js';
import Tutorial from './components/modes/TutorialMode.js';
import {GenerateMode} from './components/modes/GenerateMode.js';
import {ChatMode} from './components/modes/ChatMode.js';
import {ConfigMode} from './components/modes/ConfigMode.js';
import {
	apiKey,
	getDebugMode,
	gitignoreCatdocDirectories,
} from './services/ConfigManagement.js';
import {ConfigError} from './components/ConfigError.js';
import {DocManager} from './services/DocManager.js'; // Import DocManager

const DEBUG = getDebugMode();
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'catdoc-debug.log');

// Initialize logging
try {
	if (!fs.existsSync(LOGS_DIR)) {
		fs.mkdirSync(LOGS_DIR, {recursive: true});
	}
	fs.writeFileSync(
		LOG_FILE,
		`=== New Session Started at ${new Date().toISOString()} ===\n`,
	);
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

debugLog('Logging system initialized');

interface AppProps {
	path?: string;
}

const App: React.FC<AppProps> = ({path: initialPath = process.cwd()}) => {
	const workspacePath = path.resolve(initialPath);
	debugLog(`Resolved workspace path: ${workspacePath}`);

	const [activeMode, setActiveMode] = useState<MenuOption | null>(null);
	const [docManager, setDocManager] = useState<DocManager | null>(null); // State for DocManager
	const [statusMessage, setStatusMessage] = useState<string | null>(null); // State for status messages
	const {exit} = useApp();
	const {stdout} = useStdout();
	const terminalHeight = stdout?.rows ?? 24;
	const terminalWidth = stdout?.columns ?? 80;

	// Initialize DocManager once on mount
	useEffect(() => {
		debugLog('Initializing DocManager instance...');
		const manager = new DocManager(workspacePath);
		manager
			.initialize()
			.then(success => {
				if (success) {
					setDocManager(manager);
					debugLog(
						'DocManager initialized successfully (background generation started).',
					);
				} else {
					debugLog('DocManager initialization failed.');
					setStatusMessage('Error initializing documentation manager.');
				}
			})
			.catch(error => {
				debugLog(`Error during DocManager initialization: ${error}`);
				setStatusMessage('Error initializing documentation manager.');
			});

		// Cleanup DocManager on unmount
		return () => {
			debugLog('Cleaning up DocManager...');
			manager
				?.shutdown()
				.catch(err => debugLog(`Error shutting down DocManager: ${err}`));
		};
	}, [workspacePath]);

	const handleMenuSelect = (option: MenuOption) => {
		setActiveMode(option);
	};

	const handleBack = () => {
		setActiveMode(null);
		setStatusMessage(null); // Clear status message when going back
	};

	useInput(async (input, key) => {
		if (key.ctrl && input.toLowerCase() === 'c') {
			debugLog('Ctrl+C detected, exiting.');
			exit();
		}
		if (key.ctrl && input.toLowerCase() === 'r') {
			if (docManager) {
				debugLog('Ctrl+R detected, starting documentation regeneration...');
				setStatusMessage(
					'Regenerating all documentation (this may take a while)...',
				);
				try {
					const result = await docManager.regenerateAllDocs();
					setStatusMessage(
						`Documentation regeneration complete: ${result.total} files processed.`,
					);
					// Optionally clear the message after a few seconds
					setTimeout(() => setStatusMessage(null), 5000);
				} catch (error) {
					debugLog(`Error regenerating documentation: ${error}`);
					setStatusMessage('Error regenerating documentation.');
					setTimeout(() => setStatusMessage(null), 5000);
				}
			} else {
				setStatusMessage('DocManager not ready yet.');
				setTimeout(() => setStatusMessage(null), 3000);
			}
		}
	});

	// Run gitignore setup once on mount
	useEffect(() => {
		gitignoreCatdocDirectories(workspacePath);
	}, [workspacePath]);

	let content: JSX.Element;

	// Show loading state while DocManager initializes
	if (!docManager && !statusMessage?.startsWith('Error')) {
		content = (
			<Box>
				<Text>Initializing documentation system...</Text>
			</Box>
		);
	} else if (activeMode === null) {
		content = (
			<Box
				width={terminalWidth}
				height={terminalHeight}
				flexDirection="column" // Arrange elements vertically
				justifyContent="center"
				alignItems="center"
			>
				<Menu onSelect={handleMenuSelect} />
				{statusMessage && (
					<Box marginTop={1}>
						<Text color="yellow">{statusMessage}</Text>
					</Box>
				)}
			</Box>
		);
	} else {
		// Render the selected mode
		switch (activeMode) {
			case 'generate':
				if (!apiKey) {
					content = <ConfigError onBack={handleBack} />;
				} else {
					content = (
						<GenerateMode workspacePath={workspacePath} onBack={handleBack} />
					);
				}
				break;
			case 'chat':
				content = (
					<Box width={terminalWidth} height={terminalHeight}>
						<ChatMode onBack={handleBack} workspacePath={workspacePath} />
					</Box>
				);
				break;
			case 'config':
				content = (
					<Box width={terminalWidth} height={terminalHeight}>
						<ConfigMode onBack={handleBack} />
					</Box>
				);
				break;
			case 'tutorial':
				content = (
					<Box width={terminalWidth} height={terminalHeight}>
						<Tutorial onBack={handleBack} />
					</Box>
				);
				break;
			default:
				debugLog(`Invalid mode encountered: ${activeMode}. Returning to menu.`);
				content = (
					<Box
						width={terminalWidth}
						height={terminalHeight}
						justifyContent="center"
						alignItems="center"
					>
						<Text color="red">
							Invalid mode '{activeMode}'. Returning to menu...
						</Text>
					</Box>
				);
				// Reset invalid mode
				if (
					activeMode &&
					!['generate', 'chat', 'config', 'tutorial'].includes(activeMode)
				) {
					setActiveMode(null);
				}
				break;
		}
	}

	// Ensure the main Box takes full size and wraps the content
	return (
		<Box width={terminalWidth} height={terminalHeight} flexDirection="column">
			{/* Render the main content */}
			{content}

			{/* Display status message at the bottom if not in menu view */}
			{statusMessage && activeMode !== null && (
				<Box position="absolute" paddingX={1}>
					<Text color="yellow">{statusMessage}</Text>
				</Box>
			)}
		</Box>
	);
};

export default App;
