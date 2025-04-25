import React, {useState, useCallback, useEffect} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
import {streamText} from 'ai';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {apiKey} from '../services/ConfigManagement.js';
import * as fs from 'fs';
import * as path from 'path';
import figures from 'figures';

// Define the structure for a message
interface Message {
	id: number;
	sender: 'user' | 'bot';
	text: string;
}

// Cool cat ASCII art for welcome message
const CAT_LOGO =
	`
   /\\     /\\
  {  ` +
	'`' +
	`---'  }
  {  O   O  }
  ~~>  V  <~~  CatDoc Assistant
   \\  ===  /
    \\___/
`;

/**
 * A terminal-based chatbot interface component using Ink.
 */
const ChatInterface: React.FC<{}> = ({}) => {
	// State definitions
	const [messages, setMessages] = useState<Message[]>([
		{
			id: 0,
			sender: 'bot',
			text: `Welcome to CatDoc! ${figures.star} I'm your purr-sonal code assistant.\nAsk me anything about your codebase and I'll try to help!`,
		},
	]);
	const [inputValue, setInputValue] = useState<string>('');
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [docsContext, setDocsContext] = useState<string>('');
	const [isDocsLoading, setIsDocsLoading] = useState<boolean>(true);
	const [thinkingDots, setThinkingDots] = useState('');
	const {exit} = useApp();

	// Animation for thinking state
	useEffect(() => {
		if (!isLoading) return;

		const interval = setInterval(() => {
			setThinkingDots(prev => {
				if (prev === '...') return '';
				return prev + '.';
			});
		}, 300);

		return () => clearInterval(interval);
	}, [isLoading]);

	// Load documents once when component mounts
	useEffect(() => {
		const docsFilePath = path.join(process.cwd(), 'docs', 'docs.json');

		try {
			if (fs.existsSync(docsFilePath)) {
				const docsJson = fs.readFileSync(docsFilePath, {encoding: 'utf8'});
				setDocsContext(docsJson);
				console.log('Documentation loaded successfully');
			} else {
				console.error(`Documentation file not found at: ${docsFilePath}`);
				setMessages(prev => [
					...prev,
					{
						id: Date.now(),
						sender: 'bot',
						text: `${figures.warning} Meow! I couldn't find any documentation files. I may not be able to answer code-specific questions.`,
					},
				]);
			}
		} catch (error) {
			console.error('Error checking documentation:', error);
			setMessages(prev => [
				...prev,
				{
					id: Date.now(),
					sender: 'bot',
					text: `${figures.warning} Meow! Something went wrong while loading the documentation. I may not be able to help with code questions.`,
				},
			]);
		} finally {
			setIsDocsLoading(false);
		}
	}, []);

	const googleClient = createGoogleGenerativeAI({
		baseURL: 'https://generativelanguage.googleapis.com/v1beta',
		apiKey: apiKey,
	});
	const model = googleClient('gemini-2.5-pro-exp-03-25');

	/**
	 * Creates a conversational prompt that includes chat history and documentation context.
	 */
	const createConversationalPrompt = (messageHistory: Message[]) => {
		const conversationContext = messageHistory
			.map(msg => `${msg.sender === 'user' ? 'User' : 'CatDoc'}: ${msg.text}`)
			.join('\n\n');

		return `You are CatDoc, a helpful, cat-themed code assistant with access to knowledge about this codebase.
Your personality is friendly, helpful, and occasionally uses subtle cat puns or references.

## Documents Context
${docsContext}

## Conversation History
${conversationContext}

## Instructions
1. Base your response primarily on information contained in the provided documents.
2. When referencing specific information from the documents, indicate which document it came from (e.g., "According to [filename]...").
3. If the documents don't contain sufficient information to fully answer the query, clearly state this limitation.
4. Keep responses concise yet comprehensive, focusing on the most relevant information.
5. If code examples would be helpful, include them formatted appropriately.
6. Maintain a conversational tone and reference previous exchanges when appropriate.
7. Occasionally add subtle cat-themed phrases or puns (but don't overdo it).
8. Do not make up information that isn't supported by the documents or your general knowledge.

Please respond to the user's latest message.`;
	};

	/**
	 * Gets a streaming response from the bot.
	 */
	const getBotResponse = async (query: string) => {
		const systemPrompt = createConversationalPrompt([
			...messages,
			{id: Date.now(), sender: 'user', text: query},
		]);
		return streamText({
			model: model,
			system: systemPrompt,
			prompt: query,
		});
	};

	/**
	 * Handles the submission of the user's input.
	 */
	const handleSubmit = useCallback(async () => {
		const textToSubmit = inputValue.trim();
		if (!textToSubmit || isLoading || isDocsLoading) return;

		const userMessage: Message = {
			id: Date.now(),
			sender: 'user',
			text: textToSubmit,
		};
		setMessages(prev => [...prev, userMessage]);
		setInputValue('');
		setIsLoading(true);

		try {
			const botMessageId = Date.now() + 1;
			setMessages(prev => [
				...prev,
				{id: botMessageId, sender: 'bot', text: ''},
			]);

			const stream = await getBotResponse(textToSubmit);
			let fullText = '';

			for await (const chunk of stream.textStream) {
				fullText += chunk;
				setMessages(prev =>
					prev.map(msg =>
						msg.id === botMessageId ? {...msg, text: fullText} : msg,
					),
				);
			}
		} catch (error: any) {
			console.error('Bot response error:', error);
			const errorMessage: Message = {
				id: Date.now() + 1,
				sender: 'bot',
				text: `${figures.cross} Meow! I encountered an error. Please try again. ${error}`,
			};
			setMessages(prev => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
			setThinkingDots('');
		}
	}, [inputValue, isLoading, isDocsLoading, messages, docsContext]);

	// Input handling
	useInput((input, key) => {
		if (isLoading || isDocsLoading) return;

		if (key.return) {
			handleSubmit();
		} else if (key.backspace || key.delete) {
			setInputValue(prev => prev.slice(0, -1));
		} else if (key.ctrl && input === 'c') {
			exit();
		} else if (!key.ctrl && !key.meta && !key.shift && input) {
			setInputValue(prev => prev + input);
		}
	});

	// Render UI
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="magenta"
			padding={1}
			width="100%"
		>
			{/* Header with cat logo */}
			<Box marginBottom={1} justifyContent="center">
				<Text color="cyan">{CAT_LOGO}</Text>
			</Box>

			{/* Divider */}
			<Box borderStyle="double" borderColor="magenta" marginBottom={1} />

			{/* Message Display Area */}
			<Box flexGrow={1} flexDirection="column" marginBottom={1}>
				{/* Show loading state for docs */}
				{isDocsLoading && (
					<Box>
						<Text color="yellow">
							{figures.arrowRight} Loading codebase knowledge{thinkingDots}
						</Text>
					</Box>
				)}

				{/* Display Messages */}
				{messages.map(msg => (
					<Box key={msg.id} flexDirection="column" marginBottom={1}>
						<Box>
							<Text bold color={msg.sender === 'user' ? 'blue' : 'green'}>
								{msg.sender === 'user'
									? `${figures.pointer} You:`
									: `${figures.star} CatDoc:`}
							</Text>
						</Box>
						<Box paddingLeft={2}>
							<Text wrap="wrap">{msg.text}</Text>
						</Box>
					</Box>
				))}

				{/* Thinking animation */}
				{isLoading && messages[messages.length - 1]?.sender !== 'bot' && (
					<Box>
						<Text color="yellow">
							{figures.star} Thinking{thinkingDots}
						</Text>
					</Box>
				)}
			</Box>

			{/* Input Area */}
			<Box borderStyle="single" borderColor="cyan" />
			<Box marginTop={1}>
				<Text bold color="blue">
					{figures.pointer}{' '}
				</Text>
				<Text>{inputValue}</Text>
				{!isLoading && <Text>_</Text>}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					{isDocsLoading
						? 'Loading documentation... please wait.'
						: `(Type your question and press Enter ${figures.arrowRight} | Ctrl+C to exit)`}
				</Text>
			</Box>
		</Box>
	);
};

export default ChatInterface;
