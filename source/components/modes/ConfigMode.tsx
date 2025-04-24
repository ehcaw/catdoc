import React, {useState, useEffect, useRef} from 'react';
import {useInput, Box, Text, useStdout} from 'ink';
import TextInput from 'ink-text-input';
import {
	updateApiKey,
	updateDebugMode,
	getDebugMode,
	apiKey as storedApiKey,
} from '../../services/ConfigMangagement.js';

// Function to handle config
export const ConfigMode: React.FC<{onBack: () => void}> = ({onBack}) => {
	// Get terminal dimensions
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalHeight = stdout?.rows ?? 24;

	// Refs for animation timers
	const messageTimer = useRef<NodeJS.Timeout | null>(null);

	// State for config options
	const [apiKey, setApiKey] = useState(storedApiKey || '');
	const [isApiKeyEditing, setIsApiKeyEditing] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>(
		'info',
	);
	const [debugMode, setDebugMode] = useState<boolean>(false);
	const [focusedOption, setFocusedOption] = useState<'api' | 'debug'>('api');

	// Animation states
	const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

	// Load debug setting on initialization
	useEffect(() => {
		try {
			const currentDebugMode = getDebugMode();
			setDebugMode(currentDebugMode);
		} catch (error) {
			console.error('Failed to load debug mode:', error);
		}

		// Clear any message timers on unmount
		return () => {
			if (messageTimer.current) {
				clearTimeout(messageTimer.current);
			}
		};
	}, []);

	// Display a message with auto-clear after delay
	const displayMessage = (
		msg: string,
		type: 'success' | 'error' | 'info' = 'info',
		duration: number = 5000,
	) => {
		setMessage(msg);
		setMessageType(type);

		// Clear any existing timer
		if (messageTimer.current) {
			clearTimeout(messageTimer.current);
		}

		// Set new timer to clear message
		messageTimer.current = setTimeout(() => {
			setMessage(null);
		}, duration);
	};

	// Handle debug toggle separately from API key editing
	const toggleDebugMode = () => {
		const newValue = !debugMode;
		setDebugMode(newValue);
		try {
			updateDebugMode(newValue);
			displayMessage(
				`Debug mode ${newValue ? 'enabled' : 'disabled'}!`,
				'success',
			);

			// Show success animation briefly
			setShowSuccessAnimation(true);
			setTimeout(() => setShowSuccessAnimation(false), 1000);
		} catch (error) {
			displayMessage(`Error updating debug mode: ${error}`, 'error');
		}
	};

	useInput((input, key) => {
		// Fix: Remove !input check which was preventing escape from working
		if (key.escape) {
			if (isApiKeyEditing) {
				// If editing API key, exit edit mode first
				setIsApiKeyEditing(false);
			} else {
				// Otherwise go back
				onBack();
			}
		} else if (
			input.toLowerCase() === 'e' &&
			!isApiKeyEditing &&
			focusedOption === 'api'
		) {
			setIsApiKeyEditing(true);
			setMessage(null);
		} else if (key.tab) {
			// Toggle focus between API key and debug toggle
			setFocusedOption(prev => (prev === 'api' ? 'debug' : 'api'));
		} else if (focusedOption === 'debug' && (key.return || input === ' ')) {
			// Toggle debug mode when Enter or Space is pressed
			toggleDebugMode();
		}
	});

	const handleApiKeySubmit = (value: string) => {
		const trimmedValue = value.trim();
		if (trimmedValue) {
			setApiKey(trimmedValue);
			setIsApiKeyEditing(false);
			updateApiKey(trimmedValue);
			displayMessage('API key saved successfully!', 'success');

			// Show success animation briefly
			setShowSuccessAnimation(true);
			setTimeout(() => setShowSuccessAnimation(false), 1000);
		} else {
			displayMessage('API key cannot be empty.', 'error');
		}
	};

	// Generate a masked API key for display
	const getMaskedApiKey = () => {
		if (!apiKey) return '';

		const visibleChars = 4;
		const prefix = apiKey.substring(0, visibleChars);
		const suffix = apiKey.substring(apiKey.length - visibleChars);
		const mask = '•'.repeat(Math.max(0, apiKey.length - visibleChars * 2));

		return `${prefix}${mask}${suffix}`;
	};

	return (
		<Box
			flexDirection="column"
			padding={1}
			width={terminalWidth}
			height={terminalHeight}
		>
			{/* Header */}
			<Box
				borderStyle="round"
				borderColor="cyan"
				padding={1}
				marginBottom={1}
				justifyContent="space-between"
			>
				<Box>
					<Text backgroundColor="blue" color="white" bold>
						{' '}
						⚙️ CONFIGURATION{' '}
					</Text>
					<Text> Settings for catdoc application</Text>
				</Box>
				<Text dimColor>Press Esc to go back</Text>
			</Box>

			{/* Main content area */}
			<Box
				flexDirection="column"
				padding={1}
				borderStyle="single"
				borderColor="gray"
				marginBottom={1}
				flexGrow={1}
			>
				{/* API Key Setting - FIX: use undefined instead of 'none' for borderStyle */}
				<Box
					marginY={1}
					flexDirection="column"
					borderStyle={focusedOption === 'api' ? 'round' : undefined}
					borderColor={focusedOption === 'api' ? 'blue' : undefined}
					padding={focusedOption === 'api' ? 1 : 0}
				>
					<Box marginBottom={1}>
						<Text bold color={focusedOption === 'api' ? 'blue' : undefined}>
							{focusedOption === 'api' ? '›› ' : '   '}Google API Key
						</Text>
						<Text color="gray"> (for AI-powered documentation)</Text>
					</Box>

					<Box paddingLeft={3}>
						{isApiKeyEditing && focusedOption === 'api' ? (
							<Box>
								<Text>Enter key: </Text>
								<TextInput
									value={apiKey}
									onChange={setApiKey}
									onSubmit={handleApiKeySubmit}
									placeholder="Enter your Google API key here..."
									showCursor
								/>
							</Box>
						) : (
							<Box>
								<Text color={apiKey ? 'green' : 'yellow'} bold>
									{apiKey ? getMaskedApiKey() : 'No API key set'}
								</Text>
								{focusedOption === 'api' && !isApiKeyEditing && (
									<Text dimColor> (Press 'E' to edit)</Text>
								)}
							</Box>
						)}
					</Box>
				</Box>

				{/* Debug Mode Toggle - FIX: use undefined instead of 'none' for borderStyle */}
				<Box
					marginY={1}
					flexDirection="column"
					borderStyle={focusedOption === 'debug' ? 'round' : undefined}
					borderColor={focusedOption === 'debug' ? 'blue' : undefined}
					padding={focusedOption === 'debug' ? 1 : 0}
				>
					<Box marginBottom={1}>
						<Text bold color={focusedOption === 'debug' ? 'blue' : undefined}>
							{focusedOption === 'debug' ? '›› ' : '   '}Debug Mode
						</Text>
						<Text color="gray"> (detailed logging for troubleshooting)</Text>
					</Box>

					<Box paddingLeft={3}>
						<Box marginRight={2}>
							<Text
								color={debugMode ? 'green' : undefined}
								backgroundColor={
									focusedOption === 'debug'
										? debugMode
											? 'green'
											: 'gray'
										: undefined
								}
								bold={focusedOption === 'debug'}
							>
								{debugMode ? ' ON  ' : ' OFF '}
							</Text>
						</Box>
						{focusedOption === 'debug' && (
							<Text dimColor>(Press Enter or Space to toggle)</Text>
						)}
					</Box>
				</Box>

				{/* Navigation help */}
				<Box marginY={1}>
					<Text dimColor>
						Press <Text color="cyan">Tab</Text> to navigate between options
					</Text>
				</Box>

				{/* Status message area */}
				{message && (
					<Box
						marginTop={1}
						padding={1}
						borderStyle="round"
						borderColor={
							messageType === 'success'
								? 'green'
								: messageType === 'error'
								? 'red'
								: 'blue'
						}
					>
						<Text
							color={
								messageType === 'success'
									? 'green'
									: messageType === 'error'
									? 'red'
									: 'blue'
							}
						>
							{messageType === 'success'
								? '✓ '
								: messageType === 'error'
								? '✗ '
								: 'ℹ '}
							{message}
						</Text>
					</Box>
				)}

				{/* Success animation overlay - FIX: use 'absolute' instead of position object */}
				{showSuccessAnimation && (
					<Box
						position="absolute"
						alignItems="center"
						justifyContent="center"
						width={terminalWidth - 4}
						height={10}
					>
						<Box padding={1} borderStyle="round" borderColor="green">
							<Text backgroundColor="black">
								<Text color="green" bold>
									✓ Saved successfully!
								</Text>
							</Text>
						</Box>
					</Box>
				)}
			</Box>

			{/* Help box */}
			<Box marginTop={1} padding={1} borderStyle="round" borderColor="yellow">
				<Text bold color="yellow">
					💡 Tips:
				</Text>
				<Box paddingLeft={2} flexDirection="column">
					<Text>• Your API key is stored locally in catdoc.config.json</Text>
					<Text>• Debug logs are saved in the ./logs directory</Text>
					<Text>• API keys must have access to the Google Gemini API</Text>
				</Box>
			</Box>
		</Box>
	);
};
