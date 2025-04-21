import React, {useState} from 'react';
import {useInput, Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {updateApiKey} from '../../services/ConfigMangagement.js';

// Function to handle config
export const ConfigMode: React.FC<{onBack: () => void}> = ({onBack}) => {
	const [apiKey, setApiKey] = useState('');
	const [isEditing, setIsEditing] = useState(true);
	const [message, setMessage] = useState<string | null>(null);

	useInput((input, key) => {
		if (key.ctrl && input.toLowerCase() === 'b') {
			if (!isEditing) {
				onBack();
			}
		} else if (input.toLowerCase() === 'e' && !isEditing) {
			setIsEditing(true);
			setMessage(null);
		}
	});

	const handleSubmit = (value: string) => {
		const trimmedValue = value.trim();
		if (trimmedValue) {
			setApiKey(trimmedValue);
			setIsEditing(false);
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
				<Text>
					{' '}
					(
					{isEditing
						? 'Enter to save, Ctrl+C to cancel edit'
						: 'Press Ctrl+B to go back, E to edit'}
					)
				</Text>
			</Box>

			<Box marginY={1} flexDirection="row">
				<Text>Google API Key: </Text>
				{isEditing ? (
					<TextInput
						value={apiKey}
						onChange={setApiKey}
						onSubmit={handleSubmit}
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
					</Text>
				)}
			</Box>

			{message && (
				<Box marginTop={1}>
					<Text color={message.includes('successfully') ? 'green' : 'yellow'}>
						{message}
					</Text>
				</Box>
			)}

			<Box marginTop={2}>
				<Text dimColor>
					Your API key will be used for code analysis and generating
					documentation.
				</Text>
				<Text dimColor>It is stored locally in your configuration.</Text>
			</Box>
		</Box>
	);
};
