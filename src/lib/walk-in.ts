export function walkInMatchIssue(matchCount: number, alreadyRegistered: boolean) {
  if (matchCount > 1) return "The email and phone match different people. Ask an administrator to resolve the records.";
  if (alreadyRegistered) return "This person is already registered. Find them in check-in instead.";
  return null;
}
