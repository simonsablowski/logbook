export const STATUSES = ['idea', 'planned', 'in-progress', 'completed'];
export const TYPES = ['feature', 'change', 'content', 'bug', 'chore', 'docs', 'idea'];
export const PRIORITIES = ['now', 'next', 'later'];
export const EFFORTS = ['S', 'M', 'L'];
export const ORIGINS = ['live', 'reconstructed'];

const DATE = /^\d{4}-\d\d-\d\d$/;

export function validateTicket(ticket, prefixes) {
  const errors = [];
  const id = typeof ticket.id === 'string' ? ticket.id : '';

  if (!/^[A-Z]{3}-\d+$/.test(id)) errors.push('id must look like ABC-123');
  if (ticket.project !== id.slice(0, 3)) errors.push('project must match the id prefix');
  if (!prefixes.includes(ticket.project)) errors.push(`unknown project ${ticket.project}`);
  if (typeof ticket.title !== 'string' || !ticket.title.trim()) errors.push('title is required');
  if (!TYPES.includes(ticket.type)) errors.push(`type must be one of ${TYPES.join(', ')}`);
  if (!STATUSES.includes(ticket.status)) errors.push(`status must be one of ${STATUSES.join(', ')}`);
  if (ticket.status !== 'completed' && !PRIORITIES.includes(ticket.priority)) {
    errors.push(`priority must be one of ${PRIORITIES.join(', ')}`);
  }
  if (ticket.effort != null && !EFFORTS.includes(ticket.effort)) errors.push(`effort must be one of ${EFFORTS.join(', ')}`);
  if (!DATE.test(ticket.created || '')) errors.push('created must be a date (YYYY-MM-DD)');
  if (ticket.status === 'completed' && !DATE.test(ticket.completed || '')) {
    errors.push('completed tickets need a completed date (YYYY-MM-DD)');
  }
  if (ticket.origin != null && !ORIGINS.includes(ticket.origin)) errors.push(`origin must be one of ${ORIGINS.join(', ')}`);
  if (typeof ticket.body !== 'string') errors.push('body must be a string');
  if (!Array.isArray(ticket.commits) || ticket.commits.some((c) => !c || typeof c.sha !== 'string' || typeof c.subject !== 'string')) {
    errors.push('commits must be a list of { sha, subject }');
  }
  return errors;
}
