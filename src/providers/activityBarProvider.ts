// src/providers/activityBarProvider.ts
import * as vscode from 'vscode';
import { NoVulnerabilitiesTreeItem, NoWorkspaceTreeItem, ReadyToScanTreeItem, VulnerabilityTreeItem } from '../ui/treeItems';
// Importe le DTO de réponse de liste et le type Union détaillé
import { GetProjectVulnerabilitiesResponseDto } from '../dtos/result/response/get-project-vulnerabilities-response.dto'; // Ajuste chemin
import { DetailedVulnerability } from '../dtos/result/details'; // Ajuste chemin

export class ActivityBarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Utilise maintenant le type Union détaillé
    private vulnerabilities: DetailedVulnerability[] = [];
    private isLoading: boolean = false;
    private hasScanned: boolean = false; // Indique si un scan a été tenté/terminé
    private currentError: string | null = null;

    /**
     * Met à jour les données affichées et rafraîchit la vue.
     * @param results La réponse de l'API contenant la liste des vulnérabilités (ou null si pas de scan réussi)
     * @param error Message d'erreur s'il y en a eu un.
     */
    public refresh(results?: GetProjectVulnerabilitiesResponseDto | null, error?: string): void {
        console.log('ActivityBarProvider: Refreshing view...');
        this.isLoading = false; // Fin du chargement
        this.currentError = error || null;

        if (this.currentError) {
            console.error('ActivityBarProvider: Refreshing with error:', this.currentError);
            this.vulnerabilities = []; // Vide la liste en cas d'erreur
            this.hasScanned = true; // Marque qu'un scan a été tenté
        } else if (results && Array.isArray(results.vulnerabilities)) {
             // IMPORTANT: Assure-toi que l'API renvoie bien des objets correspondant à DetailedVulnerability
             // Si ce n'est pas le cas, il faudra mapper les données ici.
            this.vulnerabilities = results.vulnerabilities as DetailedVulnerability[]; // Cast prudent
            this.hasScanned = true;
            console.log(`ActivityBarProvider: Refreshed with ${this.vulnerabilities.length} vulnerabilities.`);
        } else {
            // Scan réussi mais pas de résultats ou format inattendu
            this.vulnerabilities = [];
            this.hasScanned = true; // Marque comme scanné même si vide
             if (results) { // Si results existe mais n'a pas .vulnerabilities comme array
                console.warn('ActivityBarProvider: Scan results received but in unexpected format or empty.', results);
             } else {
                 console.log('ActivityBarProvider: Refreshing with no results (scan successful but empty).');
             }
        }

        this._onDidChangeTreeData.fire(); // Notifie VS Code de mettre à jour la vue
    }

    /**
     * Met la vue en état de chargement.
     */
    public setLoading(loading: boolean): void {
        console.log(`ActivityBarProvider: Setting loading state to ${loading}`);
        this.isLoading = loading;
        this.currentError = null; // Efface l'erreur précédente
        if (loading) {
            this.vulnerabilities = []; // Efface les résultats précédents
            this.hasScanned = false; // Un nouveau scan commence
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        // Retourne l'élément tel quel, car nous créons déjà des TreeItems complets
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        // Si un élément est passé, nous demandons les enfants de cet élément.
        // Comme notre liste est plate, nous retournons un tableau vide.
        if (element) {
            return Promise.resolve([]);
        }

        // --- Affichage Racine ---

        // 1. Vérifier si un dossier est ouvert
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return Promise.resolve([new NoWorkspaceTreeItem()]);
        }

        // 2. Gérer l'état de chargement
        if (this.isLoading) {
            const loadingItem = new vscode.TreeItem("$(loading~spin) Scanning project...", vscode.TreeItemCollapsibleState.None);
            loadingItem.description = "Please wait";
            return Promise.resolve([loadingItem]);
        }

        // 3. Gérer l'état d'erreur
        if (this.currentError) {
            const errorItem = new vscode.TreeItem(`$(error) Scan Failed`, vscode.TreeItemCollapsibleState.None);
            errorItem.tooltip = this.currentError;
            errorItem.description = "See Output > Cybex Scanner for details"; // Donner une piste
            return Promise.resolve([errorItem]);
        }

        // 4. Gérer l'état après un scan (réussi ou non)
        if (this.hasScanned) {
            if (this.vulnerabilities.length === 0) {
                // Scan terminé, aucune vulnérabilité trouvée
                return Promise.resolve([new NoVulnerabilitiesTreeItem()]);
            } else {
                // Scan terminé, afficher les vulnérabilités
                return Promise.resolve(
                    this.vulnerabilities.map(vuln => new VulnerabilityTreeItem(vuln))
                );
            }
        }

        // 5. État initial (dossier ouvert, pas encore scanné, pas en chargement/erreur)
        // Normalement géré par les boutons dans le header de la vue maintenant.
        // On peut retourner un item "Prêt" ou juste un tableau vide.
        const readyItem = new ReadyToScanTreeItem();
        return Promise.resolve([readyItem]); // Ou simplement: Promise.resolve([])
    }
}