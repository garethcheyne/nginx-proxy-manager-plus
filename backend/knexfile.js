export default {
	development: {
		client:     'mysql2',
		migrations: {
			tableName: 'migrations',
			stub:      'lib/migrate_template.js',
			directory: 'migrations'
		}
	},

	production: {
		client:     'mysql2',
		migrations: {
			tableName: 'migrations',
			stub:      'lib/migrate_template.js',
			directory: 'migrations'
		}
	},

	postgres: {
		client:     'pg',
		connection: {
			host:     process.env.DB_POSTGRES_HOST || 'localhost',
			port:     process.env.DB_POSTGRES_PORT || 5432,
			user:     process.env.DB_POSTGRES_USER || 'npm',
			password: process.env.DB_POSTGRES_PASSWORD || 'npmpass',
			database: process.env.DB_POSTGRES_NAME || 'npm'
		},
		migrations: {
			tableName: 'migrations',
			stub:      'lib/migrate_template.js',
			directory: 'migrations'
		}
	}
};
