export type BatchExecutorOptions = {
  batchSize?: number;
  onProgress?: (progress: number) => void;
};

export async function executeBatch<T, R>(
  items: T[],
  processor: (item: T) => R,
  options: BatchExecutorOptions = {}
): Promise<R[]> {
  const { batchSize = 100, onProgress } = options;
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, items.length);
    const batch = items.slice(i, batchEnd);
    
    batch.forEach(item => results.push(processor(item)));
    
    if (onProgress) {
      const progress = (batchEnd / items.length) * 100;
      onProgress(progress);
    }
    
    if (batchEnd < items.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return results;
}

export async function executeBatchAsync<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: BatchExecutorOptions = {}
): Promise<R[]> {
  const { batchSize = 100, onProgress } = options;
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, items.length);
    const batch = items.slice(i, batchEnd);
    
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    
    if (onProgress) {
      const progress = (batchEnd / items.length) * 100;
      onProgress(progress);
    }
    
    if (batchEnd < items.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return results;
}
