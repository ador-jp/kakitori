import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

const src = fileURLToPath(new URL('../src', import.meta.url));
const unsupported = new Set([
  'hasOwn', 'at', 'structuredClone', 'findLast', 'findLastIndex',
  'group', 'groupToMap', 'groupBy', 'randomUUID', 'toReversed', 'toSorted',
  'toSpliced', 'with', 'withResolvers', 'isWellFormed', 'toWellFormed', 'fromAsync'
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

it('keeps runtime source free of APIs introduced after Safari 15.0', () => {
  const violations: string[] = [];
  for (const file of sourceFiles(src)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      const name = ts.isPropertyAccessExpression(node) ? node.name.text
        : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text
        : ts.isIdentifier(node) && node.text === 'structuredClone' ? node.text : undefined;
      if (name && unsupported.has(name)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(`${relative(src, file)}:${line + 1}: ${name}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(violations).toEqual([]);
});
