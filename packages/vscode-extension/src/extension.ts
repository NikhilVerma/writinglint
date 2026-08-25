import * as vscode from 'vscode';
import { createSlopSift, inputKind, type MinimumLevel, type SlopSift } from 'slopsift';
import { lintPath } from './documents.js';

const CONFIGURATION = 'slopsift';
const SOURCE = 'slopsift';

interface Settings {
  enabled: boolean;
  level: MinimumLevel;
  modelPath?: string;
  downloadModel: boolean;
  debounce: number;
}

const severity: Readonly<Record<'info' | 'warn' | 'error', vscode.DiagnosticSeverity>> = {
  info: vscode.DiagnosticSeverity.Information,
  warn: vscode.DiagnosticSeverity.Warning,
  error: vscode.DiagnosticSeverity.Error,
};

function settings(document?: vscode.TextDocument): Settings {
  const config = vscode.workspace.getConfiguration(CONFIGURATION, document?.uri);
  const modelPath = config.get<string>('modelPath', '').trim();
  return {
    enabled: config.get<boolean>('enable', true),
    level: config.get<MinimumLevel>('minimumLevel', 'warning'),
    modelPath: modelPath || undefined,
    downloadModel: config.get<boolean>('downloadModel', false),
    debounce: config.get<number>('debounceMilliseconds', 450),
  };
}

class SlopSiftController implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection(SOURCE);
  private readonly output = vscode.window.createOutputChannel('SlopSift', { log: true });
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly generations = new Map<string, number>();
  private engine?: { key: string; promise: Promise<SlopSift> };
  private lastAutomaticError = '';
  private readonly bundledModelPath: string;

  constructor(context: vscode.ExtensionContext) {
    this.bundledModelPath = context.asAbsolutePath('model');
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => { void this.lint(document); }),
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.schedule(document)),
      vscode.workspace.onDidSaveTextDocument((document) => { void this.lint(document); }),
      vscode.workspace.onDidCloseTextDocument((document) => this.clear(document.uri)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(CONFIGURATION)) return;
        this.engine = undefined;
        for (const document of vscode.workspace.textDocuments) void this.lint(document);
      }),
      vscode.commands.registerCommand('slopsift.lintDocument', async () => {
        const document = vscode.window.activeTextEditor?.document;
        if (!document) {
          void vscode.window.showInformationMessage('SlopSift: no active text document.');
          return;
        }
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'SlopSift: linting document' },
          () => this.lint(document, true),
        );
      }),
      vscode.commands.registerCommand('slopsift.showOutput', () => this.output.show(true)),
    );

    for (const document of vscode.workspace.textDocuments) void this.lint(document);
  }

  private schedule(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.lint(document);
    }, settings(document).debounce);
    this.timers.set(key, timer);
  }

  private clear(uri: vscode.Uri): void {
    const key = uri.toString();
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
    this.generations.delete(key);
    this.diagnostics.delete(uri);
  }

  private getEngine(config: Settings): Promise<SlopSift> {
    const modelPath = config.modelPath ?? this.bundledModelPath;
    const key = `${modelPath}:${config.downloadModel}`;
    if (this.engine?.key === key) return this.engine.promise;
    const promise = createSlopSift({
      explicit: modelPath,
      download: config.downloadModel,
      onProgress: (message) => this.output.info(message),
    });
    this.engine = { key, promise };
    promise.catch(() => {
      if (this.engine?.promise === promise) this.engine = undefined;
    });
    return promise;
  }

  async lint(document: vscode.TextDocument, explicit = false): Promise<void> {
    const documentKey = document.uri.toString();
    const pending = this.timers.get(documentKey);
    if (pending) clearTimeout(pending);
    this.timers.delete(documentKey);
    const config = settings(document);
    const path = lintPath(document.fileName, document.languageId, document.isUntitled);
    if (!config.enabled || !inputKind(path)) {
      this.clear(document.uri);
      if (explicit && config.enabled) {
        void vscode.window.showInformationMessage(`SlopSift does not support ${document.languageId} documents yet.`);
      }
      return;
    }

    const key = documentKey;
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    const version = document.version;
    const source = document.getText();

    try {
      const engine = await this.getEngine(config);
      const result = await engine.lintSource(path, source, {
        level: config.level,
        rulepacks: ['ai-style', 'reader-first'],
      });
      if (this.generations.get(key) !== generation || document.version !== version || document.isClosed) return;
      const mapped = (result?.lints ?? []).map((lint) => {
        const start = document.positionAt(lint.start);
        const endOffset = Math.max(lint.end, lint.start + 1);
        const end = document.positionAt(Math.min(endOffset, source.length));
        const message = lint.suggestion ? `${lint.message}\nSuggestion: ${lint.suggestion}` : lint.message;
        const diagnostic = new vscode.Diagnostic(new vscode.Range(start, end), message, severity[lint.severity]);
        diagnostic.source = SOURCE;
        diagnostic.code = lint.ruleId;
        return diagnostic;
      });
      this.diagnostics.set(document.uri, mapped);
      this.lastAutomaticError = '';
      this.output.info(`${document.uri.fsPath || document.uri.toString()}: ${mapped.length} finding${mapped.length === 1 ? '' : 's'}`);
      if (explicit) {
        void vscode.window.showInformationMessage(`SlopSift found ${mapped.length} issue${mapped.length === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      if (this.generations.get(key) !== generation) return;
      this.diagnostics.delete(document.uri);
      const message = error instanceof Error ? error.message : String(error);
      this.output.error(`${document.uri.fsPath || document.uri.toString()}: ${message}`);
      if (explicit || this.lastAutomaticError !== message) {
        this.lastAutomaticError = message;
        const action = await vscode.window.showWarningMessage(`SlopSift could not lint this document: ${message}`, 'Show Output');
        if (action === 'Show Output') this.output.show(true);
      }
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.diagnostics.dispose();
    this.output.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(new SlopSiftController(context));
}

export function deactivate(): void {}
