// src/utilities/utils.ts

/**
 * Generates a random nonce string for Content Security Policy.
 */
export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Tu pourras ajouter d'autres fonctions utilitaires ici plus tard
// export function escapeHtml(unsafe: string): string { ... } // Alternative à lodash si besoin