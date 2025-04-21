import React, {useState, useEffect} from 'react';
import {useInput, Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {
	updateApiKey,
	updateDebugMode,
	getDebugMode,
} from '../../services/ConfigMangagement.js';

// Function to handle config
export const ConfigMode: React.FC<{onBack: () => void}> = ({onBack}) => {
	const [apiKey, setApiKey] = useState('');
	const [isApiKeyEditing, setIsApiKeyEditing] = useState(true);
	const [message, setMessage] = useState<string | null>(null);
	const [debugMode, setDebugMode] = useState<boolean>(false);
	const [focusedOption, setFocusedOption] = useState<'api' | 'debug'>('api');

	// Load debug setting on initialization
	useEffect(() => {
		try {
			const currentDebugMode = getDebugMode();
			setDebugMode(currentDebugMode);
			console.log('Loaded debug mode:', currentDebugMode);
		} catch (error) {
			console.error('Failed to load debug mode:', error);
		}
	}, []);

	// Handle debug toggle separately from API key editing
	const toggleDebugMode = () => {
		const newValue = !debugMode;
		setDebugMode(newValue);
		try {
			updateDebugMode(newValue);
			setMessage(
				`Debug mode ${
					newValue ? 'enabled' : 'disabled'
				}! Press Ctrl+B to go back to menu.`,
			);
		} catch (error) {
			setMessage(`Error updating debug mode: ${error}`);
		}
	};

	useInput((input, key) => {
		if (key.ctrl && input.toLowerCase() === 'b') {
			if (!isApiKeyEditing) {
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
			setMessage(
				'API key saved successfully! Press Ctrl+B to go back to menu.',
			);
		} else {
			setMessage('API key cannot be empty.');
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>Configuration</Text>
				<Text> (Press Tab to navigate, Ctrl+B to go back)</Text>
			</Box>

			{/* API Key Setting */}
			<Box marginY={1} flexDirection="row">
				<Text color={focusedOption === 'api' ? 'blue' : undefined}>
					{focusedOption === 'api' ? '› ' : '  '}Google API Key:
				</Text>
				{isApiKeyEditing && focusedOption === 'api' ? (
					<TextInput
						value={apiKey}
						onChange={setApiKey}
						onSubmit={handleApiKeySubmit}
						placeholder="Enter your Google API key here..."
						showCursor
					/>
				) : (
					<Text color="green">
						{apiKey.length > 8
							? `${apiKey.substring(0, 4)}...${apiKey.substring(
									apiKey.length - 4,
							  )}`
							: '****'}
						{focusedOption === 'api' && !isApiKeyEditing && (
							<Text dimColor> (Press 'E' to edit)</Text>
						)}
					</Text>
				)}
			</Box>

			{/* Debug Mode Toggle */}
			<Box marginY={1} flexDirection="row">
				<Text color={focusedOption === 'debug' ? 'blue' : undefined}>
					{focusedOption === 'debug' ? '› ' : '  '}Debug Mode:
				</Text>
				<Text
					color={debugMode ? 'green' : 'gray'}
					bold={focusedOption === 'debug'}
				>
					[{debugMode ? 'ON' : 'OFF'}]
				</Text>
				{focusedOption === 'debug' && (
					<Text dimColor> (Press Enter or Space to toggle)</Text>
				)}
			</Box>

			{message && (
				<Box marginTop={1}>
					<Text
						color={
							message.includes('successfully') ||
							message.includes('enabled') ||
							message.includes('disabled')
								? 'green'
								: 'yellow'
						}
					>
						{message}
					</Text>
				</Box>
			)}

			<Box marginTop={2}>
				<Text dimColor>
					Your API key will be used for code analysis and generating
					documentation.
				</Text>
				<Text dimColor>
					Debug mode provides detailed logs in the logs directory.
				</Text>
			</Box>
		</Box>
	);
};
