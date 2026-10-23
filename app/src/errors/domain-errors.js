// Domain errors thrown by services and repositories. Only adapters map them to HTTP status codes or MCP results.
import { ZodError } from 'zod';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

// A ZodError becomes a ValidationError listing every issue as "path: message", joined by "; ".
// Any other error is returned unchanged.
export function mapToDomainError(error) {
  if (!(error instanceof ZodError)) return error;
  const message = error.issues
    .map(issue => (issue.path.length ? `${issue.path.join('.')}: ` : '') + issue.message)
    .join('; ');
  return new ValidationError(message);
}
