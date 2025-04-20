// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/constants/constants.ts
// Identifiants des vues et conteneurs
export const VIEW_CONTAINER_ID = 'cybedefendScannerViewContainer';

// Nouveaux IDs pour les vues Webview dans le conteneur principal
export const SUMMARY_VIEW_ID = 'cybedefendScanner.summaryView';
export const SAST_VIEW_ID = 'cybedefendScanner.sastView';
export const IAC_VIEW_ID = 'cybedefendScanner.iacView';
export const SCA_VIEW_ID = 'cybedefendScanner.scaView';

// ID pour la vue de détails (dans le panel ou barre secondaire)
export const DETAIL_VIEW_ID = 'cybedefendScannerDetailView';

// Identifiants des commandes
export const COMMAND_START_SCAN = 'cybedefendScanner.startScan';
export const COMMAND_OPEN_SETTINGS = 'cybedefendScanner.openSettings';
export const COMMAND_SELECT_FOLDER = 'cybedefendScanner.selectProjectFolder';
export const COMMAND_SHOW_DETAILS = 'cybedefendScanner.showVulnerabilityDetails';
export const COMMAND_UPDATE_API_KEY = 'cybedefendScanner.updateApiKey';
export const COMMAND_OPEN_FILE_LOCATION = 'cybedefendScanner.openFileLocation';
export const COMMAND_UPDATE_PROJECT_ID = 'cybedefendScanner.updateProjectId'; // Nouvelle commande

// Clés de configuration
export const CONFIG_API_BASE_URL = 'cybedefendScanner.apiBaseUrl';
export const CONFIG_PROJECT_ID = 'cybedefendScanner.projectId'; // Peut être marqué comme déprécié
export const SECRET_API_KEY = 'cybedefendScannerApiKey'; // Clé pour SecretStorage

// Valeurs par défaut
export const DEFAULT_API_BASE_URL = 'http://localhost:3000';

// Clé pour stocker le Project ID spécifique au workspace dans workspaceState
export const WORKSPACE_PROJECT_ID_KEY_PREFIX = 'cybedefendWorkspaceProjectId:';