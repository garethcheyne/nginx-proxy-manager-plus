import * as api from "./base";

export interface BackupMetadata {
	version: string;
	date: string;
	database: {
		engine: string;
	};
	counts: Record<string, number>;
}

export interface RestoreResult {
	message: string;
	metadata: {
		version: string;
		createdAt: string;
		database: {
			engine: string;
			tables: Record<string, number>;
		};
	};
}

export async function getBackupMetadata(): Promise<BackupMetadata> {
	return api.get({ url: "/backup/metadata" });
}

export async function downloadBackup(): Promise<void> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	await api.download(
		{ url: "/backup/download" },
		`npm-backup-${timestamp}.zip`,
	);
}

export async function restoreBackup(file: File): Promise<RestoreResult> {
	const formData = new FormData();
	formData.append("backup", file);
	return api.post({ url: "/backup/restore", data: formData });
}
