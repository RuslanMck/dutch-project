// Reads the environment once, at start-up, and returns a frozen configuration object. No other module reads
// process.env; they receive the values they need.
import { environmentSchema } from '../contracts/environment-contracts.js';
import { mapToDomainError } from '../errors/domain-errors.js';

const TEST_ENVIRONMENT_NAME = 'test';

// The server needs these to authenticate anyone; tests run without them.
const REQUIRED_SECRET_NAMES = Object.freeze(['APP_PASSWORD', 'SESSION_SECRET', 'API_TOKEN']);

// environment: an object like process.env. shouldRequireSecrets: false for tools that never authenticate,
// such as the import script.
export function parseEnvironmentConfiguration(environment, { shouldRequireSecrets = true } = {}) {
  const parseResult = environmentSchema.safeParse(removeBlankValues(environment));
  if (!parseResult.success) {
    throw new Error(`invalid environment: ${mapToDomainError(parseResult.error).message}`);
  }
  const variables = parseResult.data;
  if (shouldRequireSecrets && variables.NODE_ENV !== TEST_ENVIRONMENT_NAME) {
    const missingSecretNames = REQUIRED_SECRET_NAMES.filter(secretName => !variables[secretName]);
    if (missingSecretNames.length) throw new Error(`missing required env ${missingSecretNames.join(', ')}`);
  }
  return Object.freeze({
    environmentName: variables.NODE_ENV ?? null,
    port: variables.PORT,
    applicationPassword: variables.APP_PASSWORD,
    sessionSecret: variables.SESSION_SECRET,
    apiToken: variables.API_TOKEN,
    mcpSecret: variables.MCP_SECRET,
    databasePath: variables.DB_PATH,
    backupDirectory: variables.BACKUP_DIR,
    backupRetentionCount: variables.BACKUP_KEEP,
    openRouterApiKey: variables.OPENROUTER_API_KEY,
    openRouterModel: variables.OPENROUTER_MODEL,
  });
}

function removeBlankValues(environment) {
  return Object.fromEntries(Object.entries(environment ?? {})
    .filter(([, value]) => value !== undefined && value !== ''));
}
