import {GoogleGenerativeAIEmbeddings} from '@langchain/google-genai';
import {Neo4jVectorStore} from '@langchain/community/vectorstores/neo4j_vector';
import {apiKey} from './ConfigManagement.js';
import {GraphDoc} from '../types/docs.js';
import {getDiffs, loadCache} from './treesitter.js';
import fs from 'node:fs';
import path from 'node:path';
import pkg from 'glob';
const {glob} = pkg;
import {promisify} from 'node:util';
const globPromise = promisify(glob);

export class Neo4jClient {
	private config;
	private index: Neo4jVectorStore | null;
	private workspacePath: string;
	private filter: any;
	private driver: any;

	constructor(config: any, path: string) {
		this.config = config;
		this.index = null;
		this.workspacePath = path;
		this.filter = {directory: {$eq: this.workspacePath}};
	}

	async initialize() {
		try {
			this.index = await Neo4jVectorStore.fromDocuments(
				[],
				new GoogleGenerativeAIEmbeddings({apiKey: apiKey}),
				this.config,
			);

			// Access the underlying Neo4j driver if exposed by the store
			if (this.index) {
				// Check if client property exists, otherwise try to access directly
				// Note: This depends on the Neo4jVectorStore implementation
				this.driver = (this.index as any).driver || (this.index as any).client;
				console.log('Neo4j client initialized successfully');
			}
		} catch (error) {
			console.error('Failed to initialize Neo4j client:', error);
			throw error;
		}
	}

	static async create(config: any, workspacePath: string) {
		const client = new Neo4jClient(config, workspacePath);
		await client.initialize();
		return client;
	}

	async addDocuments(docs: GraphDoc[]) {
		if (!this.index) {
			console.warn('Neo4j index not initialized. Cannot add documents.');
			return;
		}

		try {
			await this.index.addDocuments(docs);
			console.log(`Added ${docs.length} documents to Neo4j`);
		} catch (error) {
			console.error('Error adding documents to Neo4j:', error);
			throw error;
		}
	}

	transformContentToDoc(content: string, absolutePath: string): GraphDoc {
		// Normalize the path for consistent storage
		const normalizedPath = path.normalize(absolutePath).replace(/\\/g, '/');

		const doc: GraphDoc = {
			pageContent: content,
			metadata: {
				directory: this.workspacePath,
				absolutePath: normalizedPath,
				lastUpdated: new Date().toISOString(),
				fileName: path.basename(normalizedPath),
				fileType: path.extname(normalizedPath).slice(1),
			},
		};
		return doc;
	}

	// Remove documents by path
	async removeDocumentsByPath(absolutePath: string): Promise<boolean> {
		if (!this.index || !this.driver) {
			console.warn('Neo4j client not initialized. Cannot remove documents.');
			return false;
		}

		try {
			const normalizedPath = path.normalize(absolutePath).replace(/\\/g, '/');
			const session = this.driver.session();

			const result = await session.run(
				`MATCH (c:${this.config.nodeLabel})
         WHERE c.absolutePath = $path
         DETACH DELETE c
         RETURN count(c) as deleted`,
				{path: normalizedPath},
			);

			const deletedCount = result.records[0].get('deleted').toNumber();
			session.close();

			console.log(
				`Removed ${deletedCount} document(s) for path: ${normalizedPath}`,
			);
			return deletedCount > 0;
		} catch (error) {
			console.error(`Failed to remove documents for ${absolutePath}:`, error);
			return false;
		}
	}

	// Update a document (delete and re-add)
	async updateDocument(absolutePath: string): Promise<boolean> {
		if (!this.index) {
			console.warn('Neo4j index not initialized. Cannot update document.');
			return false;
		}

		try {
			// First remove existing entries
			await this.removeDocumentsByPath(absolutePath);

			// Then read and add the file if it exists
			if (fs.existsSync(absolutePath)) {
				const content = fs.readFileSync(absolutePath, 'utf-8');
				const doc = this.transformContentToDoc(content, absolutePath);
				await this.addDocuments([doc]);
				console.log(`Updated document in vector store: ${absolutePath}`);
				return true;
			} else {
				console.log(`File no longer exists: ${absolutePath}`);
				return false;
			}
		} catch (error) {
			console.error(`Error updating document ${absolutePath}:`, error);
			return false;
		}
	}

	// Process changes from tree-sitter diff
	async checkForChangesAndAdd() {
		try {
			const cache = loadCache(this.workspacePath);
			const diffs = getDiffs(this.workspacePath, cache);

			// Check what type of data is returned by getDiffs
			// Assuming it returns a structure with added, modified, deleted arrays
			const added = Array.isArray(diffs) ? [] : (diffs as any).added || [];
			const modified = Array.isArray(diffs)
				? []
				: (diffs as any).modified || [];
			const deleted = Array.isArray(diffs) ? [] : (diffs as any).deleted || [];

			console.log(
				`Processing changes: ${added.length} added, ${modified.length} modified, ${deleted.length} deleted`,
			);

			// Process files that were added or modified
			for (const filePath of [...added, ...modified]) {
				await this.updateDocument(filePath);
			}

			// Remove deleted files
			for (const filePath of deleted) {
				await this.removeDocumentsByPath(filePath);
			}

			// Save the updated cache if needed - moved this to the DocManager
			// if (typeof saveCache === 'function') {
			//   saveCache(this.workspacePath, cache);
			// }

			return {
				added: added.length,
				modified: modified.length,
				deleted: deleted.length,
			};
		} catch (error) {
			console.error('Error processing changes:', error);
			throw error;
		}
	}

	// Full reindexing - useful for initial setup or complete refresh
	async reindexWorkspace(
		filePatterns = ['**/*.md', '**/*.txt', '**/*.js', '**/*.ts', '**/*.tsx'],
	) {
		if (!this.index || !this.driver) {
			console.warn('Neo4j client not initialized. Cannot reindex workspace.');
			return;
		}

		try {
			console.log('Starting workspace reindexing...');

			// Clear all existing documents for this workspace
			const session = this.driver.session();
			const result = await session.run(
				`MATCH (c:${this.config.nodeLabel})
         WHERE c.directory = $workspace
         DETACH DELETE c
         RETURN count(c) as deleted`,
				{workspace: this.workspacePath},
			);

			const deletedCount = result.records[0].get('deleted').toNumber();
			console.log(`Cleared ${deletedCount} existing documents`);
			session.close();

			// Find all matching files in workspace
			const files: string[] = [];

			for (const pattern of filePatterns) {
				try {
					const matches = await globPromise(
						path.join(this.workspacePath, pattern),
					);
					files.push(...matches);
				} catch (error) {
					console.error(`Error with glob pattern ${pattern}:`, error);
				}
			}

			console.log(`Found ${files.length} files to index`);

			// Process in batches of 10 to avoid overwhelming the system
			const batchSize = 10;
			const batches = Math.ceil(files.length / batchSize);

			for (let i = 0; i < batches; i++) {
				const start = i * batchSize;
				const end = Math.min(start + batchSize, files.length);
				const batch = files.slice(start, end);

				const docs: GraphDoc[] = [];
				for (const file of batch) {
					try {
						const content = fs.readFileSync(file, 'utf-8');
						docs.push(this.transformContentToDoc(content, file));
					} catch (error) {
						console.error(`Error reading file ${file}:`, error);
					}
				}

				if (docs.length > 0) {
					await this.addDocuments(docs);
				}

				console.log(
					`Processed batch ${i + 1}/${batches}: ${docs.length} documents added`,
				);
			}

			console.log('Workspace reindexing complete');
			return {
				totalFiles: files.length,
			};
		} catch (error) {
			console.error('Error during reindexing:', error);
			throw error;
		}
	}

	// Query vector store with semantic search
	async queryDocuments(query: string, limit = 3) {
		if (!this.index) {
			console.warn('Neo4j index not initialized. Cannot query documents.');
			return [];
		}

		try {
			const results = await this.index.similaritySearch(
				query,
				limit,
				this.filter,
			);
			return results;
		} catch (error) {
			console.error('Error querying documents:', error);
			return [];
		}
	}

	// Get document count in the vector store
	async getDocumentCount(): Promise<number> {
		if (!this.driver) {
			return 0;
		}

		try {
			const session = this.driver.session();
			const result = await session.run(
				`MATCH (c:${this.config.nodeLabel})
         WHERE c.directory = $workspace
         RETURN count(c) as count`,
				{workspace: this.workspacePath},
			);

			const count = result.records[0].get('count').toNumber();
			session.close();
			return count;
		} catch (error) {
			console.error('Error getting document count:', error);
			return 0;
		}
	}
}
