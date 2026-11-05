/**
 * Why an inquiry can't be used here, in words for the studio, or null when it can. Letters, notes
 * and files still work on an archived inquiry, since archiving only takes it off the board; pass
 * what's being done (`"send an invoice"`) for anything an archived inquiry still can't do.
 */
export function inquiryProblem(row: { archived: boolean } | null, blockedWhenArchived?: string) {
  if (!row) return "this inquiry is no longer here.";
  if (blockedWhenArchived && row.archived) {
    return `this inquiry is archived. reopen it to ${blockedWhenArchived}.`;
  }
  return null;
}
