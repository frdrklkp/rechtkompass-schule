/** Sprint 4.6B – Registry der Situationsschemata. */
import { buildStandardSituationSchema, STANDARD_SITUATION_SCHEMA_ID } from "./standardSituationSchema";
import type { SituationSchemaDefinition } from "./types";

export class SituationSchemaRegistry {
  private readonly schemas = new Map<string, SituationSchemaDefinition>();

  constructor(initial: SituationSchemaDefinition[] = [buildStandardSituationSchema()]) {
    for (const schema of initial) this.register(schema);
  }

  register(schema: SituationSchemaDefinition): void {
    this.schemas.set(schema.id, schema);
  }

  has(id: string): boolean {
    return this.schemas.has(id);
  }

  get(id: string): SituationSchemaDefinition | null {
    return this.schemas.get(id) ?? null;
  }

  require(id: string): SituationSchemaDefinition {
    const schema = this.get(id);
    if (!schema) throw new Error(`Situationsschema "${id}" ist nicht registriert.`);
    return schema;
  }

  getStandard(): SituationSchemaDefinition {
    return this.require(STANDARD_SITUATION_SCHEMA_ID);
  }

  list(): SituationSchemaDefinition[] {
    return [...this.schemas.values()];
  }
}

export const defaultSituationSchemaRegistry = new SituationSchemaRegistry();
