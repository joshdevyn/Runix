import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator, Feature } from '@cucumber/messages';
import * as fs from 'fs';

export function parseFeatureFile(filePath: string): Feature | undefined {
  const gherkinSource = fs.readFileSync(filePath, 'utf-8');
  const builder = new AstBuilder(IdGenerator.uuid());
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);
  const parsed = parser.parse(gherkinSource);
  return parsed.feature;
}

export function parseFeatureAst(filePath: string) {
  const gherkinSource = fs.readFileSync(filePath, 'utf-8');
  const builder = new AstBuilder(IdGenerator.uuid());
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);
  const document = parser.parse(gherkinSource);
  return document;
}
