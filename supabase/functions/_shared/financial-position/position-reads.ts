/** Named entry points isolate the D-ERP328 positional Promise.all hazard. */
export async function loadPositionReads<S, P, C, F>(loaders: {
  structure: () => Promise<S>; paidContracts: () => Promise<P>;
  participations: () => Promise<C>; futureCoverage: () => Promise<F>; workers: () => Promise<unknown>;
}) {
  const [structure, paidContracts, participations, futureCoverage] = await Promise.all([
    loaders.structure(), loaders.paidContracts(), loaders.participations(), loaders.futureCoverage(), loaders.workers(),
  ]);
  return { structure, paidContracts, participations, futureCoverage };
}