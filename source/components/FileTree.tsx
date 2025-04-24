import React, {useState, useEffect, useRef, useMemo} from 'react';
import {Box, Text} from 'ink';
import {useFocus, useInput} from 'ink';
import clipboardy from 'clipboardy';
import {FileNode, FileTreeProps} from '../types/docs.js';

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
	height,
}) => {
	// Basic state
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [visibleStartIndex, setVisibleStartIndex] = useState(0);

	// Use a simpler focus approach
	const {isFocused} = useFocus({autoFocus: level === 0});

	// Manage focus state manually for the component
	const [hasFocus, setHasFocus] = useState(true); // Start with focus

	// Search state
	const [isSearching, setIsSearching] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	// Prevent scroll adjustment loops
	const isAdjustingScroll = useRef(false);

	// Function to exit search mode
	const exitSearchMode = () => {
		setIsSearching(false);
		setHasFocus(true); // Explicitly set focus back to true
	};

	// Get the full flattened file list
	const flattenedFiles = flattenTree(files);

	// Enhanced filter that preserves folder structure
	const displayedFiles = useMemo(() => {
		if (!searchQuery) return flattenedFiles;

		const query = searchQuery.toLowerCase();

		// First, identify all matching paths
		const matchingPaths = new Set<string>();

		// Add directly matching files and directories
		flattenedFiles.forEach(item => {
			if (
				item.node.name.toLowerCase().includes(query) ||
				item.path.toLowerCase().includes(query)
			) {
				matchingPaths.add(item.path);
			}
		});

		// For each matching path, add all parent directories
		const pathsToInclude = new Set<string>(matchingPaths);

		matchingPaths.forEach(path => {
			// Split the path into parts
			const parts = path.split('/');

			// Build up parent paths and add them
			for (let i = 1; i < parts.length; i++) {
				const parentPath = parts.slice(0, i).join('/');
				pathsToInclude.add(parentPath);
			}
		});

		// Filter to include only matching files and their parent directories
		return flattenedFiles.filter(item => {
			// Keep the item if it's in our paths to include
			return pathsToInclude.has(item.path);
		});
	}, [flattenedFiles, searchQuery]);

	// Calculate how many items we can show based on height
	const reservedLines = isSearching ? 3 : 2; // Extra line for search input
	const itemsPerPage = height
		? Math.max(1, height - reservedLines)
		: displayedFiles.length;
	const visibleEndIndex = Math.min(
		visibleStartIndex + itemsPerPage,
		displayedFiles.length,
	);
	const visibleItems = displayedFiles.slice(visibleStartIndex, visibleEndIndex);

	// Find the selected file index
	const selectedIndex = selectedFile
		? displayedFiles.findIndex(item => item.path === selectedFile)
		: -1;

	// Update internal focus state when external focus changes
	useEffect(() => {
		if (!isSearching) {
			setHasFocus(isFocused);
		}
	}, [isFocused, isSearching]);

	// Initial setup
	useEffect(() => {
		if (selectedIndex >= 0 && !isAdjustingScroll.current) {
			setFocusedIndex(selectedIndex);

			if (
				selectedIndex < visibleStartIndex ||
				selectedIndex >= visibleStartIndex + itemsPerPage
			) {
				isAdjustingScroll.current = true;
				setVisibleStartIndex(
					Math.max(
						0,
						Math.min(
							displayedFiles.length - itemsPerPage,
							selectedIndex - Math.floor(itemsPerPage / 2),
						),
					),
				);
				setTimeout(() => {
					isAdjustingScroll.current = false;
				}, 50);
			}
		}
	}, [
		selectedFile,
		displayedFiles.length,
		searchQuery,
		visibleStartIndex,
		itemsPerPage,
		selectedIndex,
	]);

	// Reset scroll position when search changes
	useEffect(() => {
		// Reset to top when search query changes
		setVisibleStartIndex(0);
		// Reset focus to first item
		if (displayedFiles.length > 0) {
			setFocusedIndex(0);
		}
	}, [searchQuery]);

	// Handle keyboard input
	useInput(async (input, key) => {
		// Handle input based on our internal focus state OR search mode
		if (!hasFocus && !isSearching) return;

		// Search mode handling
		if (isSearching) {
			if (key.escape) {
				exitSearchMode();
			} else if (key.return) {
				exitSearchMode();
			} else if (key.backspace || key.delete) {
				setSearchQuery(prev => prev.slice(0, -1));
			} else if (key.ctrl && input === 'u') {
				setSearchQuery('');
			} else if (
				!key.upArrow &&
				!key.downArrow &&
				!key.tab &&
				!key.pageUp &&
				!key.pageDown &&
				!key.ctrl &&
				!key.meta &&
				!key.shift &&
				input.length === 1
			) {
				setSearchQuery(prev => prev + input);
			}
		} else {
			// Normal navigation mode
			if (key.ctrl && input.toLowerCase() === 'k') {
				setIsSearching(true);
				setSearchQuery('');
				return;
			}
		}

		// Navigation (available in both modes)
		if (key.upArrow) {
			const newIndex = Math.max(0, focusedIndex - 1);
			setFocusedIndex(newIndex);

			if (newIndex < visibleStartIndex && !isAdjustingScroll.current) {
				isAdjustingScroll.current = true;
				setVisibleStartIndex(newIndex);
				setTimeout(() => {
					isAdjustingScroll.current = false;
				}, 50);
			}
		} else if (key.downArrow) {
			const newIndex = Math.min(displayedFiles.length - 1, focusedIndex + 1);
			setFocusedIndex(newIndex);

			if (newIndex >= visibleEndIndex && !isAdjustingScroll.current) {
				isAdjustingScroll.current = true;
				setVisibleStartIndex(visibleStartIndex + 1);
				setTimeout(() => {
					isAdjustingScroll.current = false;
				}, 50);
			}
		} else if (key.pageUp && height) {
			const newIndex = Math.max(0, focusedIndex - itemsPerPage);
			setFocusedIndex(newIndex);

			if (!isAdjustingScroll.current) {
				isAdjustingScroll.current = true;
				setVisibleStartIndex(Math.max(0, newIndex));
				setTimeout(() => {
					isAdjustingScroll.current = false;
				}, 50);
			}
		} else if (key.pageDown && height) {
			const newIndex = Math.min(
				displayedFiles.length - 1,
				focusedIndex + itemsPerPage,
			);
			setFocusedIndex(newIndex);

			if (!isAdjustingScroll.current) {
				isAdjustingScroll.current = true;
				const newStart = Math.min(
					displayedFiles.length - itemsPerPage,
					newIndex,
				);
				setVisibleStartIndex(Math.max(0, newStart));
				setTimeout(() => {
					isAdjustingScroll.current = false;
				}, 50);
			}
		} else if ((key.return || input === ' ') && !isSearching) {
			const focusedItem = displayedFiles[focusedIndex];
			if (focusedItem && focusedItem.node.type === 'file') {
				onSelect(focusedItem.path);
			}
		} else if (input === 'c' && !isSearching) {
			const focusedItem = displayedFiles[focusedIndex];
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
		// Use our internal focus state instead of isFocused
		const isFocusedItem =
			index + visibleStartIndex === focusedIndex && (hasFocus || isSearching);

		// Determine if this item directly matches the search
		const isDirectMatch =
			searchQuery &&
			(item.node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				item.path.toLowerCase().includes(searchQuery.toLowerCase()));

		// Display name handling
		const displayName = item.node.name;
		const shouldHighlight = searchQuery && !isSearching && isDirectMatch;
		let highlightStart = -1;
		let highlightEnd = -1;

		if (shouldHighlight) {
			const query = searchQuery.toLowerCase();
			const nameLower = displayName.toLowerCase();
			if (nameLower.includes(query)) {
				highlightStart = nameLower.indexOf(query);
				highlightEnd = highlightStart + query.length;
			}
		}

		return (
			<Box key={item.path}>
				<Text
					color={isFocusedItem ? 'blue' : isSelected ? 'green' : undefined}
					bold={isSelected || isFocusedItem}
					dimColor={
						(!isFocusedItem && !isSelected) ||
						(searchQuery.length > 0 && !isDirectMatch)
					}
				>
					{`${prefix}${icon} `}
					{shouldHighlight && highlightStart >= 0 ? (
						<>
							{displayName.substring(0, highlightStart)}
							<Text backgroundColor="yellow" color="black">
								{displayName.substring(highlightStart, highlightEnd)}
							</Text>
							{displayName.substring(highlightEnd)}
						</>
					) : (
						displayName
					)}
					{isFocusedItem && item.node.type === 'file' ? ' (Enter/Space)' : ''}
				</Text>
			</Box>
		);
	};

	// Status message with focus indicator
	const focusIndicator = hasFocus ? '●' : '○';
	const statusPosition = `${visibleStartIndex + 1}-${visibleEndIndex} of ${
		displayedFiles.length
	}`;
	const searchStatus = !searchQuery
		? ''
		: ` (filtered from ${flattenedFiles.length})`;
	const searchHint = !isSearching ? 'Ctrl+K:Search' : 'Enter:Accept Esc:Cancel';
	const navIndicator = `${focusedIndex > 0 ? '↑' : ' '}${
		focusedIndex < displayedFiles.length - 1 ? '↓' : ' '
	}`;

	return (
		<Box flexDirection="column" height={height} overflow="hidden">
			{/* Search bar */}
			{isSearching && (
				<Box borderStyle="single" borderColor="yellow" marginBottom={1}>
					<Text bold>Search: </Text>
					<Text>{searchQuery}</Text>
					<Text>█</Text>
				</Box>
			)}

			{/* File list */}
			{visibleItems.length > 0 ? (
				visibleItems.map((item, index) => renderItem(item, index))
			) : (
				<Text dimColor>No matching files found.</Text>
			)}

			{/* Status bar with focus indicator */}
			<Box marginTop={0} justifyContent="space-between" height={1}>
				<Text
					dimColor
				>{`${focusIndicator} ${statusPosition}${searchStatus}`}</Text>
				<Text dimColor>{`${searchHint} ${navIndicator}`}</Text>
			</Box>
		</Box>
	);
};
