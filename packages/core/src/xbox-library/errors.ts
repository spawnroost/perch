/** No OPENXBL_API_KEY: the server cannot call OpenXBL. */
export class XboxNotConfiguredError extends Error {
  constructor() {
    super('OPENXBL_API_KEY is not set');
    this.name = 'XboxNotConfiguredError';
  }
}

/** No Xbox profile with that gamertag. */
export class XboxGamertagNotFoundError extends Error {
  constructor() {
    super('Xbox gamertag not found');
    this.name = 'XboxGamertagNotFoundError';
  }
}

/** Xbox returned no game history: the profile's game history is private (or the account is new). */
export class XboxProfilePrivateError extends Error {
  constructor() {
    super('Xbox game history is private or empty');
    this.name = 'XboxProfilePrivateError';
  }
}

/** OpenXBL's hourly request limit is used up (HTTP 429 or no requests remaining). */
export class XboxRateLimitedError extends Error {
  constructor() {
    super('OpenXBL rate limit reached');
    this.name = 'XboxRateLimitedError';
  }
}

/** OpenXBL could not be reached or answered with an error or unreadable body. */
export class XboxNetworkError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'XboxNetworkError';
  }
}

/** The user's linked Xbox account changed while an import was running, so nothing was written. */
export class XboxAccountChangedError extends Error {
  constructor() {
    super('Xbox account changed during the import');
    this.name = 'XboxAccountChangedError';
  }
}
