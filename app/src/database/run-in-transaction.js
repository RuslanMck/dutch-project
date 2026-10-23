// Runs an operation in one SQLite transaction (a savepoint when nested) and turns constraint failures
// (a duplicate legacy_id, a broken foreign key) into ConflictError.
import { ConflictError } from '../errors/domain-errors.js';

export function createTransactionRunner({ database }) {
  return function runInTransaction(operation) {
    try {
      return database.transaction(operation)();
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
        throw new ConflictError(`constraint violated: ${error.message}`);
      }
      throw error;
    }
  };
}
