// catdoc/source/components/modes/ChatMode.tsx
import React, {useState, useEffect} from 'react';
import {useInput, Box, Text} from 'ink';
import ChatInterface from '../ChatInterface.js';
import * as fs from 'fs';

export const ChatMode: React.FC<{
	onBack: () => void;
	workspacePath: string;
}> = ({onBack}) => {
	const [loading, _setLoading] = useState<boolean>(true);
	const [error, _setError] = useState<string | null>(null);

	useEffect(() => {
		if (fs.existsSync('docs/docs.json')) {
			_setLoading(false);
		}
	}, []);

	useInput((input, key) => {
		if (key.escape && !input) {
			onBack();
		}
	});

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Connecting to database, please wait...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">{error}</Text>
				<Text>Press ESC to go back</Text>
			</Box>
		);
	}

	return <ChatInterface />;
};
