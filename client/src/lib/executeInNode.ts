import type { ExecuteRequest, RunEvent } from './types';

export async function executeInNode(
  request: ExecuteRequest,
  emit: (event: RunEvent) => void
): Promise<void> {
  const response = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.body) {
    throw new Error('Node execution did not return a stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      emit(JSON.parse(line) as RunEvent);
    }
  }

  if (buffer.trim()) {
    emit(JSON.parse(buffer) as RunEvent);
  }
}
