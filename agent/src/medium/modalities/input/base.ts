/** Base class for input modalities (text, audio, image). */
export abstract class BaseInputModality {
  abstract readonly key: string;
}

export class InputModalityRegistry {
  private readonly map = new Map<string, BaseInputModality>();

  add(m: BaseInputModality): this {
    this.map.set(m.key, m);
    return this;
  }

  get(key: string): BaseInputModality | undefined {
    return this.map.get(key);
  }

  get size(): number {
    return this.map.size;
  }
}
