import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {LoadingCat} from '../LoadingCat.js';

interface TutorialProps {
	onBack: () => void;
}

/**
 * A tutorial component that explains how to use the catdoc application.
 * It walks users through different sections of the app with animated progress.
 */
export const Tutorial: React.FC<TutorialProps> = ({onBack}) => {
	// Tutorial sections content
	const sections = [
		{
			title: 'Welcome to catdoc! 🐱',
			content: [
				'catdoc is a terminal-based tool that helps you browse, understand, and document your codebase.',
				'It uses AI to analyze your code and generate helpful documentation.',
				'',
				"Let's learn how to use it!",
			],
		},
		{
			title: 'Generate Documentation Mode',
			content: [
				"From the main menu, select 'Generate Documentation' to browse your codebase.",
				'• Navigate the file tree using arrow keys',
				'• Press Enter or Space to select a file',
				'• View file documentation in the right panel',
				'• Press Shift+C to copy documentation to clipboard',
				'',
				'When you first open a project, catdoc automatically scans for changed files',
				'and generates documentation for them.',
			],
		},
		{
			title: 'Chat with Codebase Mode',
			content: [
				"Select 'Chat with Codebase' from the main menu to ask questions about your code.",
				'• Type your question and press Enter',
				'• The AI will analyze your code and provide answers',
				'• Ask about specific files, functions, or general patterns',
				'',
				'Example questions:',
				'• "How does the DocManager.ts file work?"',
				'• "Explain the tree-sitter implementation"',
				'• "What does the GenerateMode component do?"',
			],
		},
		{
			title: 'Configuration Mode',
			content: [
				"Select 'Configuration' from the main menu to set up your API keys.",
				'• Enter your Google API key to enable AI documentation generation',
				'• Press Enter to save',
				'• Press E to edit existing configuration',
				'',
				'Your API key is stored locally in catdoc.config.json',
			],
		},
		{
			title: 'Keyboard Shortcuts',
			content: [
				'Global shortcuts:',
				'• Ctrl+B - Go back to previous screen/menu',
				'• Ctrl+C - Exit application (from main menu)',
				'',
				'File browser shortcuts:',
				'• Arrow keys - Navigate files and directories',
				'• Enter/Space - Select file',
				'• Shift+C - Copy documentation',
				'',
				"That's it! You're ready to use catdoc!",
			],
		},
	];

	const [currentSection, setCurrentSection] = useState(0);
	const [displayedSteps, setDisplayedSteps] = useState<number[]>([0]);
	const [isAnimating, setIsAnimating] = useState(false);

	// Capture keyboard input
	useInput((input, key) => {
		if (key.return || key.tab) {
			// Advance to next section when Enter or Space is pressed
			if (currentSection < sections.length - 1) {
				setCurrentSection(prev => prev + 1);
				setIsAnimating(true);
			} else {
				// Return to menu on last section
				onBack();
			}
		} else if (key.ctrl && input.toLowerCase() === 'b') {
			// Go back to menu with Ctrl+B
			onBack();
		} else if (key.leftArrow && currentSection > 0) {
			// Go to previous section with left arrow
			setCurrentSection(prev => prev - 1);
		} else if (key.rightArrow && currentSection < sections.length - 1) {
			// Go to next section with right arrow
			setCurrentSection(prev => prev + 1);
			setIsAnimating(true);
		}
	});

	// Animate new steps appearing
	useEffect(() => {
		if (isAnimating) {
			const timer = setTimeout(() => {
				if (!displayedSteps.includes(currentSection)) {
					setDisplayedSteps(prev => [...prev, currentSection]);
				}
				setIsAnimating(false);
			}, 100);
			return () => clearTimeout(timer);
		}
		return () => {}; // Fix: Empty return function for the false case
	}, [isAnimating, currentSection, displayedSteps]);

	// Ensure currentSection is within bounds
	const validSection = Math.min(
		Math.max(0, currentSection),
		sections.length - 1,
	);
	const currentTitle = sections[validSection]?.title || 'Tutorial';
	const currentContent = sections[validSection]?.content || [
		'No content available',
	];

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>Tutorial - {currentTitle}</Text>
				<Text dimColor>
					{' '}
					({validSection + 1}/{sections.length})
				</Text>
				<Text> (Press Enter to continue, Ctrl+B to exit)</Text>
			</Box>

			{isAnimating ? (
				<LoadingCat message="Loading..." />
			) : (
				<Box flexDirection="column" marginTop={1}>
					{currentContent.map((line, idx) => (
						<Text key={idx}>{line}</Text>
					))}
				</Box>
			)}

			<Box marginTop={2} justifyContent="space-between">
				<Text dimColor>
					{validSection > 0 ? '◀ Previous (Left Arrow)' : '                   '}
				</Text>
				<Text dimColor>
					{validSection < sections.length - 1
						? 'Next (Right Arrow) ▶'
						: 'Finish (Enter) ✓'}
				</Text>
			</Box>
		</Box>
	);
};

export default Tutorial;
