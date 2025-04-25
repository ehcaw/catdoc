export interface FileDocumentation {
	path: string;
	lastUpdated: string;
	summary: string;
	type: string;
	hash?: string; // Git hash when last documented
	preview: string;
	lastModified: number;
}
export interface ProjectDocumentation {
	version: string;
	lastUpdated: string;
	files: Record<string, FileDocumentation>;
}

export interface FileNode {
	name: string;
	type: 'file' | 'directory';
	children?: FileNode[];
	documentation?: string;
	preview?: string;
	path?: string;
}

export interface FileTreeProps {
	files: FileNode;
	selectedFile: string | null;
	onSelect: (path: string) => void;
	level?: number;
	parentPath?: string;
	height?: number; // Add height prop
}

export interface GraphDoc {
	pageContent: string; // for now we will store the summaries and have the ai respond from there
	metadata: {};
}
