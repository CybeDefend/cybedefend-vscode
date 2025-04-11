# cybedefend-vscode

src/
├── api/         # Logique d'appel API
├── auth/        # Gestion de l'authentification (clé API)
├── commands/    # Logique des commandes VS Code
├── constants/   # Constantes (IDs, clés de config, etc.)
├── dtos/        # <-- DTO
├── providers/   # TreeView et Webview providers
├── test/        # <-- Existe déjà (pour les tests)
├── ui/          # Composants UI (TreeItems, contenu Webview)
├── utilities/   # Fonctions utilitaires
└── extension.ts # Point d'entrée principal (activation/désactivation)
