import React from 'react';
import {useInput} from 'ink';
import ChatInterface from '../ChatInterface.js';

export const ChatMode: React.FC<{onBack: () => void}> = ({onBack}) => {
	useInput((input, key) => {
		if (key.escape && !input) {
			onBack();
		}
	});
	return <ChatInterface />;
};
