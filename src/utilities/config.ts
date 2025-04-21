// src/utilities/config.ts
import * as vscode from 'vscode';
import { CONFIG_API_BASE_URL, CONFIG_PROJECT_ID, DEFAULT_API_BASE_URL } from '../constants/constants';

/**
 * Retrieves the API Base URL from VS Code settings.
 * Falls back to the default URL if not configured.
 */
export function getApiBaseUrl(): string {
  return vscode.workspace.getConfiguration().get<string>(CONFIG_API_BASE_URL) || DEFAULT_API_BASE_URL;
}

/**
 * Retrieves the Project ID from VS Code settings.
 * Returns undefined if not configured.
 */
export function getProjectId(): string | undefined {
  const projectId = vscode.workspace.getConfiguration().get<string>(CONFIG_PROJECT_ID);
  return projectId?.trim() || undefined; // Return undefined if empty or just whitespace
}