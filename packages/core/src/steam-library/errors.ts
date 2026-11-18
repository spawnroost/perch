/** The profile's game details are private, so Steam returns no game list. */
export class SteamProfilePrivateError extends Error {
  constructor() {
    super('Steam game details are private');
    this.name = 'SteamProfilePrivateError';
  }
}

/** No STEAM_API_KEY: the server cannot call the Steam Web API. */
export class SteamNotConfiguredError extends Error {
  constructor() {
    super('STEAM_API_KEY is not set');
    this.name = 'SteamNotConfiguredError';
  }
}

/** The Steam Web API could not be reached or answered with an error or unreadable body. */
export class SteamNetworkError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SteamNetworkError';
  }
}
