import { Strategy } from './types.js';

export class StrategyRegistry {
  private strategies: Map<string, Strategy> = new Map();

  register(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  get(id: string): Strategy | undefined {
    return this.strategies.get(id);
  }

  list(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  describeForLLM(): string {
    return this.list()
      .map(s => `- ${s.id}: ${s.name} — ${s.description}`)
      .join('\n');
  }
}