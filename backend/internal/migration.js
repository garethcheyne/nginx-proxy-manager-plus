import fs from "node:fs";
import path from "node:path";
import extractZip from "extract-zip";
import { debug, global as logger } from "../logger.js";
import db from "../db.js";
import error from "../lib/error.js";

/**
 * Tables to import during migration (in order for foreign key constraints)
 */
const migrationTables = [
	"user",
	"auth",
	"user_permission",
	"setting",
	"access_list",
	"access_list_auth",
	"access_list_client",
	"certificate",
	"proxy_host",
	"redirection_host",
	"dead_host",
	"stream",
];

/**
 * Recursively copy a directory
 */
function copyDirectorySync(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirectorySync(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

const internalMigration = {
	/**
	 * Validate an uploaded migration export file
	 * @param {Access} access
	 * @param {String} zipPath  Path to the uploaded ZIP file
	 * @returns {Promise<{valid: boolean, metadata: object, preview: object}>}
	 */
	validateExport: async (access, zipPath) => {
		await access.can("backup:restore");

		if (!fs.existsSync(zipPath)) {
			throw new error.ItemNotFoundError("Migration file not found");
		}

		debug(logger, `Validating migration export from ${zipPath}...`);

		// Extract to temp directory
		const extractDir = `/tmp/npm-migration-validate-${Date.now()}`;
		fs.mkdirSync(extractDir, { recursive: true });

		try {
			await extractZip(zipPath, { dir: extractDir });
		} catch (err) {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError(`Invalid export file: ${err.message}`);
		}

		// Check for metadata.json
		const metadataPath = path.join(extractDir, "metadata.json");
		if (!fs.existsSync(metadataPath)) {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError("Invalid export: missing metadata.json");
		}

		let metadata;
		try {
			metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
		} catch {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError("Invalid export: corrupted metadata.json");
		}

		// Check for database.json
		const dbPath = path.join(extractDir, "database.json");
		let databaseExport = {};
		if (fs.existsSync(dbPath)) {
			try {
				databaseExport = JSON.parse(fs.readFileSync(dbPath, "utf8"));
			} catch {
				// May be empty or invalid
			}
		}

		// Build preview of what will be imported
		const preview = {
			users: databaseExport.user?.filter((u) => !u.is_deleted)?.length || 0,
			proxyHosts: databaseExport.proxy_host?.filter((h) => !h.is_deleted)?.length || 0,
			redirectionHosts: databaseExport.redirection_host?.filter((h) => !h.is_deleted)?.length || 0,
			deadHosts: databaseExport.dead_host?.filter((h) => !h.is_deleted)?.length || 0,
			streams: databaseExport.stream?.filter((s) => !s.is_deleted)?.length || 0,
			certificates: databaseExport.certificate?.filter((c) => !c.is_deleted)?.length || 0,
			accessLists: databaseExport.access_list?.filter((a) => !a.is_deleted)?.length || 0,
			hasNginxConfigs: fs.existsSync(path.join(extractDir, "nginx")),
			hasLetsEncrypt: fs.existsSync(path.join(extractDir, "certificates", "letsencrypt")),
			hasCustomSSL: fs.existsSync(path.join(extractDir, "certificates", "custom_ssl")),
		};

		// Cleanup
		fs.rmSync(extractDir, { recursive: true, force: true });

		return {
			valid: true,
			metadata,
			preview,
		};
	},

	/**
	 * Import from a migration export ZIP
	 * @param {Access} access
	 * @param {String} zipPath  Path to the uploaded ZIP file
	 * @param {Object} options  Import options
	 * @param {boolean} options.importUsers  Whether to import users
	 * @param {boolean} options.importHosts  Whether to import hosts
	 * @param {boolean} options.importCertificates  Whether to import certificates
	 * @param {boolean} options.importAccessLists  Whether to import access lists
	 * @param {boolean} options.overwriteExisting  Whether to overwrite existing records
	 * @returns {Promise<{message: string, imported: object}>}
	 */
	importExport: async (access, zipPath, options = {}) => {
		await access.can("backup:restore");

		const {
			importUsers = true,
			importHosts = true,
			importCertificates = true,
			importAccessLists = true,
			overwriteExisting = false,
		} = options;

		if (!fs.existsSync(zipPath)) {
			throw new error.ItemNotFoundError("Migration file not found");
		}

		debug(logger, `Starting migration import from ${zipPath}...`);

		// Extract to temp directory
		const extractDir = `/tmp/npm-migration-import-${Date.now()}`;
		fs.mkdirSync(extractDir, { recursive: true });

		try {
			await extractZip(zipPath, { dir: extractDir });
		} catch (err) {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError(`Invalid export file: ${err.message}`);
		}

		// Validate structure
		const metadataPath = path.join(extractDir, "metadata.json");
		if (!fs.existsSync(metadataPath)) {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError("Invalid export: missing metadata.json");
		}

		const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

		// Load database export
		const dbPath = path.join(extractDir, "database.json");
		let databaseExport = {};
		if (fs.existsSync(dbPath)) {
			try {
				databaseExport = JSON.parse(fs.readFileSync(dbPath, "utf8"));
			} catch {
				logger.warn("Could not parse database.json, skipping database import");
			}
		}

		const knex = db();
		const imported = {
			users: 0,
			proxyHosts: 0,
			redirectionHosts: 0,
			deadHosts: 0,
			streams: 0,
			certificates: 0,
			accessLists: 0,
			nginxConfigs: 0,
			sslFiles: 0,
		};

		// Normalize ISO datetime strings for MySQL compatibility
		const normalizeDates = (rows) => {
			return rows.map((row) => {
				const normalized = { ...row };
				for (const [key, value] of Object.entries(normalized)) {
					if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
						normalized[key] = value.replace("T", " ").replace(".000Z", "");
					}
				}
				return normalized;
			});
		};

		// Helper to import a table
		const importTable = async (trx, tableName, rows, countKey) => {
			if (!rows || rows.length === 0) return;

			const normalizedRows = normalizeDates(rows);

			for (const row of normalizedRows) {
				// Skip deleted records
				if (row.is_deleted) continue;

				try {
					// Check if record exists
					const existing = await trx(tableName).where("id", row.id).first();

					if (existing) {
						if (overwriteExisting) {
							await trx(tableName).where("id", row.id).update(row);
							imported[countKey]++;
						}
						// Skip if not overwriting
					} else {
						await trx(tableName).insert(row);
						imported[countKey]++;
					}
				} catch (err) {
					logger.warn(`Failed to import ${tableName} record ${row.id}: ${err.message}`);
				}
			}
		};

		// Import database within transaction
		await knex.transaction(async (trx) => {
			// Disable foreign key checks for MySQL
			const isMysql = knex.client.config.client === "mysql2";
			if (isMysql) {
				await trx.raw("SET FOREIGN_KEY_CHECKS = 0");
			}

			// Import users and auth
			if (importUsers && databaseExport.user) {
				await importTable(trx, "user", databaseExport.user, "users");
				if (databaseExport.auth) {
					await importTable(trx, "auth", databaseExport.auth, "users");
				}
			}

			// Import access lists
			if (importAccessLists) {
				if (databaseExport.access_list) {
					await importTable(trx, "access_list", databaseExport.access_list, "accessLists");
				}
				if (databaseExport.access_list_auth) {
					for (const row of databaseExport.access_list_auth || []) {
						try {
							await trx("access_list_auth").insert(row);
						} catch {
							// Ignore duplicates
						}
					}
				}
				if (databaseExport.access_list_client) {
					for (const row of databaseExport.access_list_client || []) {
						try {
							await trx("access_list_client").insert(row);
						} catch {
							// Ignore duplicates
						}
					}
				}
			}

			// Import certificates
			if (importCertificates && databaseExport.certificate) {
				await importTable(trx, "certificate", databaseExport.certificate, "certificates");
			}

			// Import hosts
			if (importHosts) {
				if (databaseExport.proxy_host) {
					await importTable(trx, "proxy_host", databaseExport.proxy_host, "proxyHosts");
				}
				if (databaseExport.redirection_host) {
					await importTable(trx, "redirection_host", databaseExport.redirection_host, "redirectionHosts");
				}
				if (databaseExport.dead_host) {
					await importTable(trx, "dead_host", databaseExport.dead_host, "deadHosts");
				}
				if (databaseExport.stream) {
					await importTable(trx, "stream", databaseExport.stream, "streams");
				}
			}

			// Re-enable foreign key checks
			if (isMysql) {
				await trx.raw("SET FOREIGN_KEY_CHECKS = 1");
			}
		});

		// Import nginx configurations
		if (importHosts) {
			const nginxSrcDir = path.join(extractDir, "nginx");
			if (fs.existsSync(nginxSrcDir)) {
				const nginxDestDir = "/data/nginx";

				// Copy config directories
				const configDirs = ["proxy_host", "redirection_host", "dead_host", "stream"];
				for (const dir of configDirs) {
					const srcDir = path.join(nginxSrcDir, dir);
					const destDir = path.join(nginxDestDir, dir);
					if (fs.existsSync(srcDir)) {
						const files = fs.readdirSync(srcDir);
						fs.mkdirSync(destDir, { recursive: true });
						for (const file of files) {
							const srcFile = path.join(srcDir, file);
							const destFile = path.join(destDir, file);
							if (!fs.existsSync(destFile) || overwriteExisting) {
								fs.copyFileSync(srcFile, destFile);
								imported.nginxConfigs++;
							}
						}
					}
				}
			}
		}

		// Import SSL certificates
		if (importCertificates) {
			// Custom SSL
			const customSSLSrc = path.join(extractDir, "certificates", "custom_ssl");
			if (fs.existsSync(customSSLSrc)) {
				copyDirectorySync(customSSLSrc, "/data/custom_ssl");
				imported.sslFiles += fs.readdirSync(customSSLSrc).length;
			}

			// Let's Encrypt
			const leSrc = path.join(extractDir, "certificates", "letsencrypt");
			if (fs.existsSync(leSrc)) {
				const leDirs = ["live", "archive", "renewal"];
				for (const dir of leDirs) {
					const srcDir = path.join(leSrc, dir);
					const destDir = path.join("/etc/letsencrypt", dir);
					if (fs.existsSync(srcDir)) {
						copyDirectorySync(srcDir, destDir);
						imported.sslFiles++;
					}
				}
			}

			// Credentials
			const credSrc = path.join(extractDir, "certificates", "credentials");
			if (fs.existsSync(credSrc)) {
				copyDirectorySync(credSrc, "/etc/letsencrypt/credentials");
			}
		}

		// Cleanup
		fs.rmSync(extractDir, { recursive: true, force: true });

		debug(logger, "Migration import completed successfully");

		return {
			message: "Migration import completed successfully",
			metadata,
			imported,
		};
	},
};

export default internalMigration;
