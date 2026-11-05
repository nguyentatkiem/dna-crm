// Dự báo khả năng chốt. Module Dự báo hoàn thiện file này.
export type Forecast = {
  pipeline: number;
  weighted: number;
  byMonth: { month: string; amount: number }[];
  deals: { id: string; title: string; amount: number; prob: number; ownerName: string }[];
  trainedOn: number;
};
export async function refreshPredictions(_workspaceId?: string): Promise<void> {}
export async function forecastWorkspace(_workspaceId: string): Promise<Forecast> {
  return { pipeline: 0, weighted: 0, byMonth: [], deals: [], trainedOn: 0 };
}
