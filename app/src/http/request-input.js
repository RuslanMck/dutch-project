// Reads the raw input of an Express request for a route adapter to parse with a contract.

export function readRequestBody(request) {
  return request.body ?? {};
}

// Query values that are missing or blank count as not given.
export function removeBlankQueryValues(query) {
  return Object.fromEntries(Object.entries(query ?? {}).filter(([, value]) => !isBlankValue(value)));
}

function isBlankValue(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}
