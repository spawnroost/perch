/** No PSN_NPSSO: the server cannot call PlayStation. */
export class PsnNotConfiguredError extends Error {
  constructor() {
    super('PSN_NPSSO is not set');
    this.name = 'PsnNotConfiguredError';
  }
}

/** PlayStation refused the server's NPSSO (it lasts about two months and is renewed by hand). */
export class PsnAuthFailedError extends Error {
  constructor() {
    super('PSN_NPSSO expired, renew it');
    this.name = 'PsnAuthFailedError';
  }
}

/** No PlayStation profile with that online ID. */
export class PsnNotFoundError extends Error {
  constructor() {
    super('PlayStation online ID not found');
    this.name = 'PsnNotFoundError';
  }
}

/** PlayStation returned no played games: the history is not visible to Anyone (or is empty). */
export class PsnProfilePrivateError extends Error {
  constructor() {
    super('PlayStation game history is private or empty');
    this.name = 'PsnProfilePrivateError';
  }
}

/** PlayStation is rate limiting the server. */
export class PsnRateLimitedError extends Error {
  constructor() {
    super('PlayStation rate limit reached');
    this.name = 'PsnRateLimitedError';
  }
}

/** PlayStation could not be reached or answered with an error or unreadable body. */
export class PsnNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PsnNetworkError';
  }
}

/** The user's linked PlayStation account changed while an import was running, so nothing was written. */
export class PsnAccountChangedError extends Error {
  constructor() {
    super('PlayStation account changed during the import');
    this.name = 'PsnAccountChangedError';
  }
}
