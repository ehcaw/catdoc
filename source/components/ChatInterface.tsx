import React, {useState, useCallback, useEffect} from 'react';
import {Box, Text, useInput, useApp, useStdout} from 'ink';
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

/**
 * A terminal-based chatbot interface component using Ink.
 */
const ChatInterface: React.FC<{}> = () => {
	// State definitions
	const [messages, setMessages] = useState<Message[]>([
		{
			id: 0,
			sender: 'bot',
			text: `Welcome to CatDoc! ${figures.star} I'm your purr-sonal code assistant.
Ask me anything about your codebase and I'll try to help!`,
		},
	]);
	const [inputValue, setInputValue] = useState<string>('');
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [docsContext, setDocsContext] = useState<string>('');
	const [isDocsLoading, setIsDocsLoading] = useState<boolean>(true);
	const [thinkingDots, setThinkingDots] = useState('');
	const {exit} = useApp();
	const {stdout} = useStdout();

	// Line-by-line scrolling
	const [lineScrollOffset, setLineScrollOffset] = useState(0);
	const [terminalWidth, setTerminalWidth] = useState(stdout.columns);

	// Track dimensions
	useEffect(() => {
		const handleResize = () => {
			setTerminalWidth(stdout.columns);
		};
		stdout.on('resize', handleResize);
		return () => {
			stdout.off('resize', handleResize);
		};
	}, [stdout]);

	// Thinking animation
	useEffect(() => {
		if (!isLoading) return;
		const interval = setInterval(() => {
			setThinkingDots(prev => (prev.length < 3 ? prev + '.' : ''));
		}, 300);
		return () => clearInterval(interval);
	}, [isLoading]);

	// Reset scroll when new messages arrive
	useEffect(() => {
		if (!isLoading) {
			setLineScrollOffset(0);
		}
	}, [messages.length, isLoading]);

	// Load documentation when component mounts
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
						text: `${figures.warning} Meow! Documentation file not found.`,
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
					text: `${figures.warning} Meow! Error loading documentation.`,
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
		return `You are CatDoc, a code assistant whose sole purpose is to answer questions about the codebase. Use the provided documentation
and conversation history to answer questions accurately.

## Documents Context
${docsContext || 'No documentation available.'}

## Conversation History
${conversationContext}

Respond to the user's latest message.`;
	};

	/**
	 * Gets a streaming response from the bot.
	 */
	const getBotResponse = async (query: string) => {
		const history: Message[] = [
			...messages,
			{id: Date.now(), sender: 'user', text: query},
		];
		const systemPrompt = createConversationalPrompt(history);
		return streamText({
			model: model,
			system: systemPrompt,
			prompt: query,
		});
	};

	/**
	 * Handles submission of the user's input.
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
			setMessages(prev => [
				...prev,
				{
					id: Date.now() + 1,
					sender: 'bot',
					text: `${figures.cross} Meow! I encountered an error. ${error}`,
				},
			]);
		} finally {
			setIsLoading(false);
			setThinkingDots('');
			setLineScrollOffset(0);
		}
	}, [inputValue, isLoading, isDocsLoading, messages, docsContext]);

	// Function to convert a message into displayable lines
	const computeMessageLines = (
		message: Message,
		availableWidth: number,
	): string[] => {
		// Maximum width for a line, accounting for padding/decorations
		const maxLineWidth = Math.max(40, availableWidth - 8);

		// Add sender
		const senderPrefix =
			message.sender === 'user'
				? `${figures.pointer} You:`
				: `${figures.star} CatDoc:`;

		const lines: string[] = [senderPrefix];

		// Split message text into paragraphs
		const paragraphs = message.text.split('\n');
		for (const paragraph of paragraphs) {
			if (!paragraph.trim()) {
				lines.push('');
				continue;
			}

			// Wrap each paragraph to fit the width
			let currentLine = '';
			const words = paragraph.split(' ');

			for (const word of words) {
				if (currentLine.length + word.length + 1 <= maxLineWidth) {
					currentLine += (currentLine ? ' ' : '') + word;
				} else {
					lines.push('  ' + currentLine); // Indent for readability
					currentLine = word;
				}
			}

			if (currentLine) {
				lines.push('  ' + currentLine); // Add the last line
			}
		}

		// Add an empty line after each message
		lines.push('');

		return lines;
	};

	// Generate all lines from all messages
	const getAllChatLines = (): string[] => {
		const allLines: string[] = [];

		messages.forEach((msg, index) => {
			const messageLines = computeMessageLines(msg, terminalWidth - 4);
			allLines.push(...messageLines);

			// Add a separator line between messages (except for the last one)
			if (index < messages.length - 1) {
				allLines.push('───────');
			}
		});

		return allLines;
	};

	// Handle input and scroll keys
	useInput((input, key) => {
		if (isDocsLoading) return;

		// Exit shortcut
		if (key.ctrl && input === 'c') {
			exit();
			return;
		}

		// Get total lines for scroll limit calculation
		const allLines = getAllChatLines();
		const totalLines = allLines.length;
		const maxVisibleLines = Math.max(10, stdout.rows - 10); // Adjust based on your UI
		const maxScroll = Math.max(0, totalLines - maxVisibleLines);

		// Handle scrolling
		if (key.upArrow) {
			setLineScrollOffset(prev => Math.min(prev + 1, maxScroll));
			return;
		}
		if (key.downArrow) {
			setLineScrollOffset(prev => Math.max(0, prev - 1));
			return;
		}
		if (key.pageUp) {
			setLineScrollOffset(prev => Math.min(prev + 5, maxScroll));
			return;
		}
		if (key.pageDown) {
			setLineScrollOffset(prev => Math.max(0, prev - 5));
			return;
		}

		// Prevent typing while loading response
		if (isLoading) return;

		// Handle text input
		if (key.return) {
			handleSubmit();
		} else if (key.backspace || key.delete) {
			setInputValue(prev => prev.slice(0, -1));
		} else if (!key.ctrl && !key.meta && !key.shift && input) {
			setInputValue(prev => prev + input);
		}
	});

	// Get visible lines based on scroll offset
	const getVisibleChatContent = () => {
		const allLines = getAllChatLines();
		const visibleLines = Math.max(10, stdout.rows - 10);

		// Calculate start and end indices
		const startIdx = Math.max(
			0,
			allLines.length - visibleLines - lineScrollOffset,
		);
		const endIdx = Math.min(allLines.length, startIdx + visibleLines);

		// Get the visible subset of lines
		return allLines.slice(startIdx, endIdx);
	};

	const visibleLines = getVisibleChatContent();
	const allLines = getAllChatLines();
	const hasMoreAbove = lineScrollOffset > 0;
	const hasMoreBelow =
		lineScrollOffset <
		Math.max(0, allLines.length - Math.max(10, stdout.rows - 10));

	return (
		<Box flexDirection="column" padding={1}>
			{/* Simple header */}
			<Box marginBottom={1} justifyContent="center">
				<Text bold color="cyan">
					CatDoc Assistant {figures.star}
				</Text>
			</Box>

			{/* Message area with line-by-line display */}
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="gray"
				padding={1}
				marginBottom={1}
				flexGrow={1}
			>
				{hasMoreAbove && (
					<Box justifyContent="center">
						<Text color="gray">{figures.arrowUp} More messages above</Text>
					</Box>
				)}

				{isDocsLoading ? (
					<Box>
						<Text color="yellow">
							{figures.arrowRight} Loading codebase knowledge{thinkingDots}
						</Text>
					</Box>
				) : (
					<Box flexDirection="column">
						{visibleLines.map((line, index) => (
							<Box key={index}>
								<Text>{line}</Text>
							</Box>
						))}
					</Box>
				)}

				{hasMoreBelow && (
					<Box justifyContent="center">
						<Text color="gray">{figures.arrowDown} More messages below</Text>
					</Box>
				)}

				{isLoading && (
					<Box marginTop={1}>
						<Text color="yellow">
							{figures.star} Thinking{thinkingDots}
						</Text>
					</Box>
				)}
			</Box>

			{/* Input area */}
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="cyan"
				padding={1}
			>
				<Box>
					<Text bold color="blue">
						{figures.pointer}
					</Text>
					<Text>{' ' + inputValue}</Text>
					{!isLoading && <Text dimColor>_</Text>}
				</Box>
				<Box marginTop={1} justifyContent="space-between">
					<Text dimColor>
						{isDocsLoading
							? 'Loading documentation...'
							: `↑/↓: Scroll | Enter: Send | Ctrl+C: Exit`}
					</Text>
					{lineScrollOffset > 0 && (
						<Text color="gray">{`Scroll: ${lineScrollOffset}`}</Text>
					)}
				</Box>
			</Box>
		</Box>
	);
};

export default ChatInterface;
