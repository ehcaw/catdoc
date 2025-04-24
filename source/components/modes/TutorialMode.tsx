import React, {useState, useEffect, useRef} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {LoadingCat} from '../LoadingCat.js';

interface TutorialProps {
	onBack: () => void;
}

/**
 * A tutorial component that explains how to use the catdoc application.
 * It walks users through different sections of the app with animated progress.
 */
export const Tutorial: React.FC<TutorialProps> = ({onBack}) => {
	// Get terminal dimensions
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalHeight = stdout?.rows ?? 24;

	// Ref for tracking animation timer
	const animationTimer = useRef<NodeJS.Timeout | null>(null);

	// Tutorial sections with updated content
	const sections = [
		{
			title: 'Welcome to catdoc! 🐱',
			icon: '😺',
			content: [
				'catdoc is a terminal-based tool that helps you browse, understand, and document your codebase.',
				'It uses AI to analyze your code and generate helpful documentation that makes sense of complex systems.',
				'',
				"Let's learn how to use it!",
			],
			tip: 'The cat knows your code better than you do!',
		},
		{
			title: 'Generate Documentation Mode',
			icon: '📝',
			content: [
				"From the main menu, select 'Generate Documentation' to browse your codebase.",
				'',
				'Key features:',
				'• Navigation: Use ↑/↓ arrow keys to move through files',
				'• Selection: Press Enter or Space to select a file',
				'• Refresh: Press Ctrl+R to refresh documentation for the current file',
				'• Copy: Press Shift+C to copy documentation to clipboard',
				'• Search: Press Ctrl+K to search through files',
				'',
				'The file tree on the left is now scrollable and the UI auto-adjusts to your terminal size.',
			],
			tip: 'Try searching with Ctrl+K to quickly find files anywhere in your project!',
		},
		{
			title: 'File Tree & Search Features',
			icon: '🔍',
			content: [
				'The improved file tree now offers:',
				'',
				'• Folder structure: Browse through directories with ease',
				'• Search: Filter files while preserving directory context',
				'• Visual indicators: Matched search terms are highlighted',
				'• Page navigation: Use PgUp/PgDn to move through large file lists',
				'• Focus tracking: The current focus state is indicated with a dot',
				'',
				'When searching, parent folders of matching files are preserved to help maintain context.',
			],
			tip: 'Press Ctrl+K, type a filename, and use arrow keys to navigate the filtered results!',
		},
		{
			title: 'Chat with Codebase Mode',
			icon: '💬',
			content: [
				"Select 'Chat with Codebase' from the main menu to ask questions about your code.",
				'',
				'• Type your question and press Enter',
				'• The AI will analyze your code and provide detailed answers',
				'• Ask about specific files, functions, or architectural patterns',
				'',
				'Example questions:',
				'• "How does the DocManager.ts file work?"',
				'• "Explain the file tree implementation"',
				'• "What does the GenerateMode component do?"',
			],
			tip: 'Ask "What are the key components in this codebase?" for a quick overview!',
		},
		{
			title: 'Configuration Mode',
			icon: '⚙️',
			content: [
				"Select 'Configuration' from the main menu to set up your API keys.",
				'',
				'• Enter your Google API key to enable AI documentation generation',
				'• Press Enter to save',
				'• Press E to edit existing configuration',
				'',
				'Your API key is stored locally in catdoc.config.json',
				'',
				'Your .catdoc directory is automatically added to .gitignore',
			],
			tip: 'Make sure your API key has access to the needed Google AI models!',
		},
		{
			title: 'Keyboard Shortcuts',
			icon: '⌨️',
			content: [
				'Global shortcuts:',
				'• Esc - Go back to previous screen/menu',
				'• Ctrl+C - Exit application (from main menu)',
				'',
				'File browser shortcuts:',
				'• ↑/↓ - Navigate files and directories',
				'• PgUp/PgDn - Scroll page up/down',
				'• Enter/Space - Select file',
				'• Ctrl+K - Search through files',
				'• Shift+C - Copy documentation',
				'• Ctrl+R - Refresh current file',
				'',
				"That's it! You're ready to use catdoc's improved interface!",
			],
			tip: 'Remember Esc to go back from any screen!',
		},
	];

	// State for tracking tutorial progress
	const [currentSection, setCurrentSection] = useState(0);
	const [_animationStage, setAnimationStage] = useState(0);
	const [isAnimating, setIsAnimating] = useState(false);
	const [fadeIn, setFadeIn] = useState(true);

	// Calculate available content height
	const headerHeight = 3;
	const footerHeight = 4;
	const progressHeight = 2;
	const availableHeight =
		terminalHeight - headerHeight - footerHeight - progressHeight;

	// Capture keyboard input
	useInput((input, key) => {
		if (isAnimating) return; // Prevent input during animations

		if (key.return || input === ' ') {
			// Advance to next section when Enter or Space is pressed
			if (currentSection < sections.length - 1) {
				nextSection();
			} else {
				// Return to menu on last section
				onBack();
			}
		} else if (key.escape && !input) {
			clearAnimationTimer();
			onBack();
		} else if (key.leftArrow && currentSection > 0) {
			// Go to previous section with left arrow
			previousSection();
		} else if (key.rightArrow && currentSection < sections.length - 1) {
			// Go to next section with right arrow
			nextSection();
		}
	});

	// Functions to handle section navigation with animations
	const nextSection = () => {
		if (currentSection < sections.length - 1) {
			setFadeIn(false);
			setIsAnimating(true);
			setAnimationStage(0);

			// Start transition sequence
			clearAnimationTimer();
			animationTimer.current = setTimeout(() => {
				setCurrentSection(prev => prev + 1);
				setAnimationStage(1);

				animationTimer.current = setTimeout(() => {
					setFadeIn(true);
					setAnimationStage(2);

					animationTimer.current = setTimeout(() => {
						setIsAnimating(false);
					}, 300);
				}, 300);
			}, 300);
		}
	};

	const previousSection = () => {
		if (currentSection > 0) {
			setFadeIn(false);
			setIsAnimating(true);

			clearAnimationTimer();
			animationTimer.current = setTimeout(() => {
				setCurrentSection(prev => prev - 1);

				animationTimer.current = setTimeout(() => {
					setFadeIn(true);

					animationTimer.current = setTimeout(() => {
						setIsAnimating(false);
					}, 200);
				}, 200);
			}, 200);
		}
	};

	// Clear any animation timers on unmount
	const clearAnimationTimer = () => {
		if (animationTimer.current) {
			clearTimeout(animationTimer.current);
			animationTimer.current = null;
		}
	};

	useEffect(() => {
		return () => clearAnimationTimer();
	}, []);

	// Ensure currentSection is within bounds
	const validSection = Math.min(
		Math.max(0, currentSection),
		sections.length - 1,
	);
	const section = sections[validSection];

	// Generate progress bar
	const renderProgressBar = () => {
		const totalWidth = terminalWidth - 10;
		const progressWidth = Math.floor(
			(validSection / (sections.length - 1)) * totalWidth,
		);

		return (
			<Box flexDirection="row" marginY={1}>
				<Text color="cyan">[</Text>
				<Text color="cyan">{`${'='.repeat(progressWidth)}${' '.repeat(
					totalWidth - progressWidth,
				)}`}</Text>
				<Text color="cyan">]</Text>
				<Text color="cyan">
					{' '}
					{validSection + 1}/{sections.length}
				</Text>
			</Box>
		);
	};

	return (
		<Box
			flexDirection="column"
			width={terminalWidth}
			height={terminalHeight}
			padding={1}
		>
			{/* Header */}
			<Box
				borderStyle="round"
				borderColor="cyan"
				padding={1}
				flexDirection="column"
			>
				<Box>
					<Text backgroundColor="blue" color="white" bold>
						{' '}
						{section?.icon} TUTORIAL{' '}
					</Text>
					<Text bold color="cyan">
						{' '}
						{section?.title}
					</Text>
				</Box>

				{renderProgressBar()}
			</Box>

			{/* Content */}
			<Box
				flexDirection="column"
				marginY={1}
				height={availableHeight}
				padding={1}
				borderStyle="single"
				borderColor={fadeIn ? 'blue' : 'gray'}
			>
				{isAnimating ? (
					<Box justifyContent="center" alignItems="center" flexGrow={1}>
						<LoadingCat message="Loading next section..." isRunning={true} />
					</Box>
				) : (
					<Box flexDirection="column" flexGrow={1}>
						{section?.content.map((line, idx) => (
							<Text
								key={idx}
								color={line.startsWith('•') ? 'white' : undefined}
							>
								{line}
							</Text>
						))}
					</Box>
				)}
			</Box>

			{/* Tip Box */}
			<Box
				borderStyle="round"
				borderColor="yellow"
				padding={1}
				marginBottom={1}
			>
				<Text color="yellow" bold>
					💡 Tip:{' '}
				</Text>
				<Text color="yellow">{section?.tip}</Text>
			</Box>

			{/* Footer */}
			<Box justifyContent="space-between" marginTop={1}>
				<Text>
					{currentSection > 0 ? (
						<Text color="blue">◀ Previous (Left Arrow)</Text>
					) : (
						<Text> </Text>
					)}
				</Text>
				<Text>
					{currentSection < sections.length - 1 ? (
						<Text color="green">Next (Right Arrow) ▶</Text>
					) : (
						<Text color="green">Finish (Enter) ✓</Text>
					)}
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					Press <Text color="cyan">Space/Enter</Text> to continue,{' '}
					<Text color="cyan">Esc</Text> to exit
				</Text>
			</Box>
		</Box>
	);
};

export default Tutorial;
