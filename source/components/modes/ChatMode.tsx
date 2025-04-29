import React, {useState, useEffect} from 'react';
import {useInput, Box, Text} from 'ink';
import ChatInterface from '../ChatInterface.js';
import * as fs from 'fs';

export const ChatMode: React.FC<{
	onBack: () => void;
	workspacePath: string;
}> = ({onBack}) => {
	const [_loading, setLoading] = useState<boolean>(true);
	const [error, _setError] = useState<string | null>(null);

	useEffect(() => {
		if (fs.existsSync('docs/docs.json')) {
			setLoading(false);
		}
	}, []);

	useInput((input, key) => {
		if (key.escape && !input) {
			onBack();
		}
	});

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">{error}</Text>
				<Text>Press ESC to go back</Text>
			</Box>
		);
	}

	// Simple container for ChatInterface
	return (
		<Box flexDirection="column" flexGrow={1}>
			<ChatInterface />
		</Box>
	);
};
