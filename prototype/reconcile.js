export function reconcile({ ingestCounters, logSize, processorSnapshot }) {
  const processed = Object.values(processorSnapshot.tenants).reduce(
    (sum, counters) => sum + (counters.processed || 0),
    0,
  );
  const duplicates = Object.values(processorSnapshot.tenants).reduce(
    (sum, counters) => sum + (counters.duplicate || 0),
    0,
  );
  const dlq = processorSnapshot.deadLetterSize;
  const accountedFor = processed + duplicates + dlq;

  return {
    ingestAccepted: ingestCounters.accepted,
    logSize,
    processed,
    duplicates,
    dlq,
    accountedFor,
    lagRecords: logSize - processorSnapshot.offset,
    acceptedMatchesLog: ingestCounters.accepted === logSize,
    processedReconciles: accountedFor === logSize,
  };
}
