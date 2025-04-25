import React, {useState, useCallback, useEffect} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
import {streamText} from 'ai';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {apiKey} from '../services/ConfigManagement.js';
import * as fs from 'fs';

// Define the structure for a message
interface Message {
	id: number;
	sender: 'user' | 'bot';
	text: string;
}

/**
 * A terminal-based chatbot interface component using Ink.
 */
const ChatInterface: React.FC<{}> = ({}) => {
	// State for the list of messages in the chat
	const [messages, setMessages] = useState<Message[]>([
		{
			id: 0,
			sender: 'bot',
			text: 'Welcome! Ask me anything about your codebase.',
		},
	]);
	// State for the current text entered by the user
	const [inputValue, setInputValue] = useState<string>('');
	// State to track if the bot is currently processing a response
	const [isLoading, setIsLoading] = useState<boolean>(false);
	// State to store document context (loaded once)
	const [docsContext, setDocsContext] = useState<string>('');
	// Access Ink's app context to allow exiting
	const {exit} = useApp();

	// Load documents once when component mounts
	useEffect(() => {
		try {
			const docsJson = fs.readFileSync('docs/docs.json', {encoding: 'utf8'});
			setDocsContext(docsJson);
		} catch (error) {
			console.error('Error loading documentation:', error);
			setMessages(prev => [
				...prev,
				{
					id: Date.now(),
					sender: 'bot',
					text: 'Warning: Failed to load codebase documentation. I may not be able to answer code-specific questions.',
				},
			]);
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
		// Format previous conversation for context
		const conversationContext = messageHistory
			.map(
				msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`,
			)
			.join('\n\n');

		// Create the system prompt with both document and conversation context
		return `You are an intelligent assistant with access to a knowledge base of documents about this codebase.

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
7. Do not make up information that isn't supported by the documents or your general knowledge.

Please respond to the user's latest message.`;
	};

	/**
	 * Gets a streaming response from the bot.
	 */
	const getBotResponse = async (query: string) => {
		// Create conversational prompt with full message history
		const systemPrompt = createConversationalPrompt([
			...messages,
			{id: Date.now(), sender: 'user', text: query},
		]);

		// Return the stream
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
		// Don't submit if input is empty or bot is already working
		if (!textToSubmit || isLoading) {
			return;
		}

		// Add the user's message to the chat
		const userMessage: Message = {
			id: Date.now(),
			sender: 'user',
			text: textToSubmit,
		};
		setMessages(prev => [...prev, userMessage]);

		// Clear the input field and set loading state
		setInputValue('');
		setIsLoading(true);

		try {
			// Create a temporary bot message that will be updated as new chunks arrive
			const botMessageId = Date.now() + 1;
			setMessages(prev => [
				...prev,
				{id: botMessageId, sender: 'bot', text: ''},
			]);

			// Get streaming response from the bot
			const stream = await getBotResponse(textToSubmit);

			// Handle the stream
			let fullText = '';

			for await (const chunk of stream.textStream) {
				fullText += chunk;

				// Update the bot's message with accumulated text so far
				setMessages(prev =>
					prev.map(msg =>
						msg.id === botMessageId ? {...msg, text: fullText} : msg,
					),
				);
			}
		} catch (error: any) {
			// If bot interaction fails, show an error message
			console.error('Bot response error:', error);
			const errorMessage: Message = {
				id: Date.now() + 1,
				sender: 'bot',
				text: `Sorry, I encountered an error. Please try again. ${error}`,
			};
			setMessages(prev => [...prev, errorMessage]);
		} finally {
			// Reset loading state regardless of success or failure
			setIsLoading(false);
		}
	}, [inputValue, isLoading, messages, docsContext]);

	// Rest of your component code stays the same...

	// Use Ink's input hook to capture keyboard events
	useInput((input, key) => {
		// Ignore input while the bot is processing
		if (isLoading) return;

		if (key.return) {
			// Handle submission on Enter key
			handleSubmit();
		} else if (key.backspace || key.delete) {
			// Handle backspace/delete
			setInputValue(prev => prev.slice(0, -1));
		} else if (key.ctrl && input === 'c') {
			// Allow Ctrl+C to exit the application
			exit();
		} else if (!key.ctrl && !key.meta && !key.shift && input) {
			// Append printable characters to the input state
			setInputValue(prev => prev + input);
		}
	});

	// Your rendering code stays the same...

	return (
		// Same UI implementation
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="cyan"
			padding={1}
			width="100%"
		>
			{/* Message Display Area */}
			<Box flexGrow={1} flexDirection="column" marginBottom={1}>
				{messages.map(msg => (
					<Box key={msg.id} flexDirection="row">
						<Text bold color={msg.sender === 'user' ? 'blue' : 'green'}>
							{msg.sender === 'user' ? 'You: ' : 'Bot: '}
						</Text>
						<Text>{msg.text}</Text>
					</Box>
				))}
				{isLoading && !messages[messages.length - 1]?.text && (
					<Box>
						<Text color="yellow">Bot is thinking...</Text>
					</Box>
				)}
			</Box>

			{/* Input Area */}
			<Box borderStyle="single" borderColor="gray" />
			<Box marginTop={1}>
				<Text bold> {'>'} </Text>
				<Text>{inputValue}</Text>
				{!isLoading && <Text>_</Text>}
			</Box>
			<Text dimColor>(Type your message and press Enter. Ctrl+C to exit.)</Text>
		</Box>
	);
};

export default ChatInterface;
