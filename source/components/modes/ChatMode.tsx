import React, {useEffect, useState} from 'react';
import {useInput} from 'ink';
import ChatInterface from '../ChatInterface.js';
import {dockerManager} from '../../services/DockerManager.js';
import {Neo4jClient} from '../../services/Neo4j.js';

const config = {
	url: 'bolt://localhost:7687', // URL for the Neo4j instance
	username: 'neo4j', // Username for Neo4j authentication
	password: 'pleaseletmein', // Password for Neo4j authentication
	indexName: 'vector', // Name of the vector index
	keywordIndexName: 'keyword', // Name of the keyword index if using hybrid search
	searchType: 'vector' as const, // Type of search (e.g., vector, hybrid)
	nodeLabel: 'Chunk', // Label for the nodes in the graph
	textNodeProperty: 'text', // Property of the node containing text
	embeddingNodeProperty: 'embedding', // Property of the node containing embedding
};

export const ChatMode: React.FC<{
	onBack: () => void;
	workspacePath: string;
}> = ({onBack, workspacePath}) => {
	let [neo4j, setNeo4j] = useState<Neo4jClient | null>(null);

	useEffect(() => {
		dockerManager.startContainer();
		console.log('docker container started');

		const setupNeo4j = async () => {
			try {
				console.log('Neo4j connected');
				const neo4j = new Neo4jClient(config, workspacePath);
				await neo4j.initialize();
				setNeo4j(neo4j);
			} catch (error) {
				console.error('Error connecting to Neo4j:', error);
			}
		};

		setupNeo4j();

		return () => {
			dockerManager.stopContainer();
		};
	}, []);

	useInput((input, key) => {
		if (key.escape && !input) {
			onBack();
		}
	});
	return <ChatInterface neo4jClient={neo4j!} />;
};
