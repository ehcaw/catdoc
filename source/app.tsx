import React, {useState, useEffect} from 'react'; // Fix: Add useEffect, remove useContext
import {useInput, useApp, Box, Text, useStdout} from 'ink'; // Fix: Use useStdout instead of StdoutContext
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
} from './services/ConfigMangagement.js';
import {ConfigError} from './components/ConfigError.js';

const DEBUG = getDebugMode();
const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'catdoc-debug.log');

// Initialize logging (Keep as is)
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
	const {exit} = useApp();

	// Fix: Use useStdout hook directly
	const {stdout} = useStdout();
	const terminalHeight = stdout?.rows ?? 24;
	const terminalWidth = stdout?.columns ?? 80;

	const handleMenuSelect = (option: MenuOption) => {
		setActiveMode(option);
	};

	const handleBack = () => {
		setActiveMode(null);
	};

	useInput((input, key) => {
		if (key.ctrl && input.toLowerCase() === 'c') {
			debugLog('Ctrl+C detected, exiting.');
			exit();
		}
	});

	// Run gitignore setup once on mount
	useEffect(() => {
		gitignoreCatdocDirectories(workspacePath);
	}, [workspacePath]);

	let content: JSX.Element;

	if (activeMode === null) {
		content = (
			<Box
				width={terminalWidth}
				height={terminalHeight}
				justifyContent="center"
				alignItems="center"
			>
				<Menu onSelect={handleMenuSelect} />
			</Box>
		);
	} else {
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
						<ChatMode onBack={handleBack} />
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
				// Separate useEffect for resetting invalid mode
				useEffect(() => {
					if (
						activeMode &&
						!['generate', 'chat', 'config', 'tutorial'].includes(activeMode)
					) {
						setActiveMode(null);
					}
				}, [activeMode]);
				break;
		}
	}

	return (
		<Box width={terminalWidth} height={terminalHeight}>
			{content}
		</Box>
	);
};

export default App;
