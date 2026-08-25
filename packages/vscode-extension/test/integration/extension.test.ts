import assert from 'node:assert/strict';
import * as vscode from 'vscode';

declare const suite: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => Promise<void> | void) => void;

const EXTENSION_ID = 'NikhilVerma01.slopsift-vscode';

async function waitForDiagnostics(uri: vscode.Uri, timeoutMilliseconds = 30_000): Promise<readonly vscode.Diagnostic[]> {
  const started = Date.now();
  while (Date.now() - started < timeoutMilliseconds) {
    const diagnostics = vscode.languages.getDiagnostics(uri).filter(({ source }) => source === 'slopsift');
    if (diagnostics.length > 0) return diagnostics;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

suite('SlopSift extension host', () => {
  test('loads the bundled model and publishes diagnostics', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} was not installed in the extension host`);
    await extension.activate();

    const workspace = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspace, 'the integration fixture workspace was not opened');
    const uri = vscode.Uri.joinPath(workspace.uri, 'sloppy.md');
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await vscode.workspace.getConfiguration('slopsift', uri).update(
      'minimumLevel',
      'info',
      vscode.ConfigurationTarget.Global,
    );
    await vscode.commands.executeCommand('slopsift.lintDocument');
    const diagnostics = await waitForDiagnostics(uri);
    assert.ok(diagnostics.length > 0, 'expected at least one SlopSift diagnostic');
    assert.ok(
      diagnostics.some(({ code }) => code === 'ai-style/emerging-slop-phrases'),
      `expected emerging-slop-phrases; received ${diagnostics.map(({ code }) => String(code)).join(', ')}`,
    );
    assert.ok(
      diagnostics.some(({ code }) => code === 'reader-first/unexplained-initialism'),
      `expected reader-first diagnostics; received ${diagnostics.map(({ code }) => String(code)).join(', ')}`,
    );
    assert.ok(
      diagnostics.every(({ range }) => !range.isEmpty),
      'every finding should point to a visible source range',
    );
  });

  test('lints prose inside source-code comments without flagging code', async () => {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspace, 'the integration fixture workspace was not opened');
    const uri = vscode.Uri.joinPath(workspace.uri, 'sloppy.ts');
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand('slopsift.lintDocument');
    const diagnostics = await waitForDiagnostics(uri);
    const phrase = diagnostics.find(({ code }) => code === 'ai-style/emerging-slop-phrases');
    assert.ok(phrase, 'expected the comment text to produce an emerging-slop-phrases diagnostic');
    assert.equal(document.getText(phrase.range), 'load-bearing');
    assert.ok(
      diagnostics.every(({ range }) => document.getText(range) !== 'value'),
      'source code should not be linted as prose',
    );
  });
});
