// The one REST error middleware: domain errors become 400/404/409 with { error: message }; anything unexpected
// becomes 500 and is logged.
import { ConflictError, mapToDomainError, NotFoundError, ValidationError } from '../errors/domain-errors.js';

const STATUS_CODE_BY_ERROR_TYPE = new Map([
  [ValidationError, 400],
  [NotFoundError, 404],
  [ConflictError, 409],
]);

export function createRestErrorHandler({ logger = console } = {}) {
  // Express recognises error middleware by its four parameters.
  // eslint-disable-next-line no-unused-vars
  return function handleRestError(caughtError, request, response, next) {
    if (response.headersSent) return next(caughtError);
    const error = mapToDomainError(caughtError);
    const statusCode = findStatusCode(error);
    if (statusCode >= 500) logger.error(error);
    response.status(statusCode).json({ error: error.message });
  };
}

// Errors from Express middleware (bad JSON, body too large) keep their own status.
function findStatusCode(error) {
  for (const [ErrorType, statusCode] of STATUS_CODE_BY_ERROR_TYPE) {
    if (error instanceof ErrorType) return statusCode;
  }
  return Number.isInteger(error.status) ? error.status : 500;
}
