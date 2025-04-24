export interface FileDocumentation {
	path: string;
	lastUpdated: string;
	content: string;
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
