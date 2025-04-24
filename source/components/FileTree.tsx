import React, {useState, useEffect} from 'react';
import {Box, Text} from 'ink';
import {useFocus, useInput} from 'ink';
import clipboardy from 'clipboardy';

interface FileNode {
	name: string;
	type: 'file' | 'directory';
	children?: FileNode[];
	documentation?: string;
	preview?: string;
	path?: string; // Make sure path is in the interface
}

interface FileTreeProps {
	files: FileNode;
	selectedFile: string | null;
	onSelect: (path: string) => void;
	level?: number;
	parentPath?: string;
	height?: number; // Add height prop
}

export const copyToClipboard = async (text: string): Promise<void> => {
	try {
		await clipboardy.write(text);
		return Promise.resolve();
	} catch (error) {
		console.error('Failed to copy to clipboard:', error);
		return Promise.reject(error);
	}
};

// Flatten the file tree into a list for easier navigation
const flattenTree = (
	node: FileNode,
	parentPath = '',
	level = 0,
): Array<{node: FileNode; path: string; level: number}> => {
	const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
	const result = [{node, path: currentPath, level}];

	if (node.type === 'directory' && node.children) {
		node.children.forEach(child => {
			result.push(...flattenTree(child, currentPath, level + 1));
		});
	}

	return result;
};

export const FileTree: React.FC<FileTreeProps> = ({
	files,
	selectedFile,
	onSelect,
	level = 0,
	height, // Use the height prop
}) => {
	const [focusedIndex, setFocusedIndex] = useState(0);
	const {isFocused} = useFocus({autoFocus: level === 0});
	const flattenedFiles = flattenTree(files);
	const [visibleStartIndex, setVisibleStartIndex] = useState(0);

	// Calculate how many items we can show based on height
	const itemsPerPage = height ? Math.max(1, height - 2) : flattenedFiles.length; // -2 for status line & border
	const visibleEndIndex = Math.min(
		visibleStartIndex + itemsPerPage,
		flattenedFiles.length,
	);
	const visibleItems = flattenedFiles.slice(visibleStartIndex, visibleEndIndex);

	// Find the selected file index in the flattened tree
	const selectedIndex = selectedFile
		? flattenedFiles.findIndex(item => item.path === selectedFile)
		: -1;

	// Ensure the selected file is visible when it changes
	useEffect(() => {
		if (selectedIndex >= 0) {
			if (selectedIndex < visibleStartIndex) {
				setVisibleStartIndex(selectedIndex);
			} else if (selectedIndex >= visibleEndIndex) {
				setVisibleStartIndex(Math.max(0, selectedIndex - itemsPerPage + 1));
			}

			// Also update focus position to match selection
			setFocusedIndex(selectedIndex);
		}
	}, [selectedFile, selectedIndex]);

	useInput(async (input, key) => {
		if (!isFocused) return;

		if (key.upArrow) {
			const newIndex = Math.max(0, focusedIndex - 1);
			setFocusedIndex(newIndex);

			// Scroll up if needed
			if (newIndex < visibleStartIndex) {
				setVisibleStartIndex(newIndex);
			}
		} else if (key.downArrow) {
			const newIndex = Math.min(flattenedFiles.length - 1, focusedIndex + 1);
			setFocusedIndex(newIndex);

			// Scroll down if needed
			if (newIndex >= visibleEndIndex) {
				setVisibleStartIndex(visibleStartIndex + 1);
			}
		} else if (key.pageUp && height) {
			// Page up - move up by page size
			const newIndex = Math.max(0, focusedIndex - itemsPerPage);
			setFocusedIndex(newIndex);
			setVisibleStartIndex(Math.max(0, visibleStartIndex - itemsPerPage));
		} else if (key.pageDown && height) {
			// Page down - move down by page size
			const newIndex = Math.min(
				flattenedFiles.length - 1,
				focusedIndex + itemsPerPage,
			);
			setFocusedIndex(newIndex);
			const newStart = Math.min(
				flattenedFiles.length - itemsPerPage,
				visibleStartIndex + itemsPerPage,
			);
			setVisibleStartIndex(Math.max(0, newStart));
		} else if (key.return || input === ' ') {
			const focusedItem = flattenedFiles[focusedIndex];
			if (focusedItem && focusedItem.node.type === 'file') {
				onSelect(focusedItem.path);
			}
		} else if (input === 'c') {
			const focusedItem = flattenedFiles[focusedIndex];
			if (focusedItem && focusedItem.node.type === 'file') {
				await copyToClipboard(focusedItem.node.documentation || '');
			}
		}
	});

	const renderItem = (
		item: {node: FileNode; path: string; level: number},
		index: number,
	) => {
		const prefix = '  '.repeat(item.level);
		const isCommonFile =
			item.node.documentation === 'Common file type - preview only';
		const icon =
			item.node.type === 'directory' ? '📁' : isCommonFile ? '📝' : '📄';
		const isSelected = selectedFile === item.path;
		const isFocusedItem =
			index + visibleStartIndex === focusedIndex && isFocused;

		return (
			<Box key={item.path}>
				<Text
					color={isFocusedItem ? 'blue' : isSelected ? 'green' : undefined}
					bold={isSelected || isFocusedItem}
					dimColor={!isFocusedItem && !isSelected}
				>
					{prefix}
					{icon} {item.node.name}
					{isFocusedItem && item.node.type === 'file'
						? ' (Press Enter or Space)'
						: ''}
				</Text>
			</Box>
		);
	};

	return (
		<Box flexDirection="column" height={height} overflow="hidden">
			{/* Only render the visible slice of items for performance */}
			{visibleItems.map((item, index) => renderItem(item, index))}

			{/* Scrollbar/status info if we're scrolling */}
			{height && flattenedFiles.length > itemsPerPage && (
				<Box marginTop={0} justifyContent="space-between" height={1}>
					<Text dimColor>
						{visibleStartIndex + 1}-{visibleEndIndex} of {flattenedFiles.length}
					</Text>
					<Text dimColor>
						{focusedIndex > 0 ? '↑' : ' '}{' '}
						{focusedIndex < flattenedFiles.length - 1 ? '↓' : ' '}
					</Text>
				</Box>
			)}
		</Box>
	);
};
