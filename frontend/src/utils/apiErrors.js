/**
 * Turn an apiClient error into a field → message map plus a summary message,
 * so forms can show server-side validation next to the right input.
 */
export const apiErrorDetails = (err) => {
  const list = err?.response?.data?.errors || [];
  const fields = {};
  for (const e of list) if (e.field && !fields[e.field]) fields[e.field] = e.message;
  return { fields, message: err?.message || 'Something went wrong. Please try again.' };
};

/**
 * Plain-language summary of a failed request for error states: what went wrong
 * and what to do. Accepts an error object or a message string.
 */
export const friendlyError = (err) => {
  const status = err?.response?.status;
  const raw = typeof err === 'string' ? err : err?.message;
  if (!status && /reach the server|network|timeout/i.test(raw || '')) {
    return 'We couldn’t reach the server. Check your internet connection, then try again.';
  }
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'Your account doesn’t have access to this. Ask an administrator if you need it.';
  if (status === 404) return 'We couldn’t find what you were looking for. It may have been removed.';
  if (status >= 500 || raw === 'An API error occurred.') {
    return 'Something went wrong on our side. Please try again in a moment.';
  }
  return raw || 'Something went wrong. Please try again.';
};
