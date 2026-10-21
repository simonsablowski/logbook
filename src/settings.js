// Settings that apply to the whole Logbook, stored in the bucket as settings.json.
// wipLimits maps a status to the number of tickets it may hold, counted across all projects;
// a status without an entry has no limit.

import { HttpError } from './tickets.js';
import { STATUSES } from './validate.js';

export const DEFAULT_SETTINGS = { wipLimits: { planned: 6, 'in-progress': 2 } };
export const LIMIT_MAX = 99;

// patch.wipLimits maps a status to a whole number from 1 to LIMIT_MAX, or to null to remove its limit.
export function patchSettings(settings, patch) {
  if (!patch || typeof patch !== 'object' || !patch.wipLimits || typeof patch.wipLimits !== 'object') {
    throw new HttpError(400, 'Send { "wipLimits": { "<status>": number or null } }.');
  }
  const wipLimits = { ...settings.wipLimits };
  for (const [status, limit] of Object.entries(patch.wipLimits)) {
    if (!STATUSES.includes(status)) throw new HttpError(400, `Unknown status ${status}.`);
    if (limit === null) delete wipLimits[status];
    else if (Number.isInteger(limit) && limit >= 1 && limit <= LIMIT_MAX) wipLimits[status] = limit;
    else throw new HttpError(400, `The limit of ${status} must be a whole number from 1 to ${LIMIT_MAX}, or null.`);
  }
  return { ...settings, wipLimits };
}
