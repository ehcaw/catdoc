// dockerService.ts
import {exec} from 'child_process';
import {promisify} from 'util';
import {getProjectRoot} from './ConfigManagement.js';

const execAsync = promisify(exec);

class DockerManager {
	private static instance: DockerManager;
	private isRunning = false;
	private usageCount = 0;
	private dockerComposeCommand: string = 'docker compose'; // Default to new format
	private projectRoot: string;

	private constructor() {
		this.projectRoot = getProjectRoot();
		this.initializeDockerCommand();
	}

	static getInstance(): DockerManager {
		if (!DockerManager.instance) {
			DockerManager.instance = new DockerManager();
		}
		return DockerManager.instance;
	}

	private async initializeDockerCommand() {
		// Try the new command format first
		try {
			await execAsync('docker compose version');
			this.dockerComposeCommand = 'docker compose';
			console.log('Using new docker compose command format');
		} catch (error) {
			// Fall back to the old format
			try {
				await execAsync('docker-compose version');
				this.dockerComposeCommand = 'docker-compose';
				console.log('Using legacy docker-compose command format');
			} catch (error) {
				console.error(
					'Neither docker compose nor docker-compose commands are available.',
				);
				console.error(
					'Please make sure Docker and Docker Compose are properly installed.',
				);
			}
		}
	}

	async startContainer() {
		this.usageCount++;
		if (!this.isRunning) {
			try {
				// Execute command in the project root directory
				const options = {cwd: this.projectRoot};
				await execAsync(`${this.dockerComposeCommand} up -d`, options);
				this.isRunning = true;
				console.log('Neo4j container started');
			} catch (error) {
				console.error('Failed to start container:', error);
			}
		}
	}

	async stopContainer() {
		this.usageCount--;
		// Only stop if no components are using it
		if (this.isRunning && this.usageCount <= 0) {
			try {
				// Execute command in the project root directory
				const options = {cwd: this.projectRoot};
				await execAsync(`${this.dockerComposeCommand} down`, options);
				this.isRunning = false;
				console.log('Neo4j container stopped');
			} catch (error) {
				console.error('Failed to stop container:', error);
			}
		}
	}
}

export const dockerManager = DockerManager.getInstance();
