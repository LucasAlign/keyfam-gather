// Guided guest substitution (issue #19). Pure preview of what a replacement
// will carry forward and which conflicts must be acknowledged, so the same
// summary drives the confirmation screen and can be unit-tested independently
// of the database.

export interface SubstitutionOriginal {
  personName: string;
  groupName: string | null;
  tableName: string | null;
  partyName: string | null;
  hasInvitation: boolean;
  isCheckedIn: boolean;
}

export interface SubstitutionOptions {
  carryGroup: boolean;
  carryTable: boolean;
  carryParty: boolean;
}

export interface TargetTableCapacity {
  name: string;
  capacity: number;
  // Active registrations at the table NOT counting the one being replaced.
  activeExcludingOriginal: number;
}

export interface SubstitutionTransfer {
  label: string;
  value: string;
}

export interface SubstitutionPreview {
  transfers: SubstitutionTransfer[];
  warnings: string[];
}

export function buildSubstitutionPreview(
  original: SubstitutionOriginal,
  options: SubstitutionOptions,
  targetTable: TargetTableCapacity | null,
  overrideCapacity: boolean,
): SubstitutionPreview {
  const transfers: SubstitutionTransfer[] = [];
  if (options.carryGroup && original.groupName) transfers.push({ label: "Group", value: original.groupName });
  if (options.carryParty && original.partyName) transfers.push({ label: "Party", value: original.partyName });
  if (options.carryTable && original.tableName) transfers.push({ label: "Table", value: original.tableName });
  if (original.hasInvitation) transfers.push({ label: "Invitation", value: "Reassigned to the replacement guest" });

  const warnings: string[] = [];
  if (original.isCheckedIn) {
    warnings.push(`${original.personName} is already checked in; substituting reverses that check-in and the replacement starts as not arrived.`);
  }
  if (options.carryTable && targetTable) {
    const projected = targetTable.activeExcludingOriginal + 1;
    if (projected > targetTable.capacity && !overrideCapacity) {
      warnings.push(`Table ${targetTable.name} is at capacity (${targetTable.activeExcludingOriginal}/${targetTable.capacity}); carrying the seat needs a capacity override.`);
    }
  }
  return { transfers, warnings };
}

// Whether the substitution can be confirmed without an override, given the
// computed preview (a blocking capacity warning is the only hard stop).
export function substitutionBlockedByCapacity(
  options: SubstitutionOptions,
  targetTable: TargetTableCapacity | null,
  overrideCapacity: boolean,
): boolean {
  if (!options.carryTable || !targetTable || overrideCapacity) return false;
  return targetTable.activeExcludingOriginal + 1 > targetTable.capacity;
}
