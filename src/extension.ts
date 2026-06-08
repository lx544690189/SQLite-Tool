import * as vscode from 'vscode';
import { SqliteEditorProvider } from './SqliteEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(SqliteEditorProvider.register(context));
}

export function deactivate() {}
