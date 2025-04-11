// src/ui/treeItems.ts
import * as vscode from 'vscode';
import { COMMAND_SELECT_FOLDER, COMMAND_SHOW_DETAILS, COMMAND_START_SCAN } from '../constants/constants';
import {
    DetailedVulnerability,
    VulnerabilitySeverityEnum,
    SastVulnerabilityDetectionDto,
    IacVulnerabilityDetectionDto,
    ScaVulnerabilityWithCvssDto
} from '../dtos/result/details';
import { ScanType } from '../api/apiService';
import { escape } from 'lodash';

// Map Severity Enum/string to Codicon IDs
const severityToIconMap: Record<string, string> = {
    [VulnerabilitySeverityEnum.CRITICAL]: 'error',
    [VulnerabilitySeverityEnum.HIGH]: 'error',
    [VulnerabilitySeverityEnum.MEDIUM]: 'warning',
    [VulnerabilitySeverityEnum.LOW]: 'info',
    [VulnerabilitySeverityEnum.INFO]: 'info',
    'UNKNOWN': 'question'
};

// --- No Workspace Item ---
export class NoWorkspaceTreeItem extends vscode.TreeItem {
    constructor() {
        super("Select Project Folder", vscode.TreeItemCollapsibleState.None);
        this.tooltip = "Please select a project folder to scan";
        this.iconPath = new vscode.ThemeIcon('folder-opened');
        this.contextValue = 'noWorkspace';
        this.command = {
            command: 'vscode.openFolder',
            title: "Select Project Folder",
            tooltip: "Select a project folder to scan",
        };
    }
}

// --- Ready To Scan Item ---
export class ReadyToScanTreeItem extends vscode.TreeItem {
    constructor() {
        super("Ready to scan", vscode.TreeItemCollapsibleState.None);
        this.description = "Use buttons above";
        this.tooltip = "Project loaded. Click 'Start Scan' in the view header.";
        this.iconPath = new vscode.ThemeIcon('play-circle');
        this.contextValue = 'readyToScan';
    }
}

// --- No Vulnerabilities Item ---
export class NoVulnerabilitiesTreeItem extends vscode.TreeItem {
    constructor() {
        super("$(check) Project Secure", vscode.TreeItemCollapsibleState.None);
        this.description = "No vulnerabilities detected.";
        this.tooltip = "The last scan found no vulnerabilities.";
        this.contextValue = 'noVulnerabilities';
    }
}

// --- Vulnerability Item ---
export class VulnerabilityTreeItem extends vscode.TreeItem {
    public readonly vulnerabilityData: DetailedVulnerability;
    public readonly vulnerabilityType?: ScanType;

    constructor(
        vulnerability: DetailedVulnerability,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        const severityString = vulnerability.currentSeverity?.toUpperCase() || VulnerabilitySeverityEnum.UNKNOWN;
        const iconId = severityToIconMap[severityString] || 'question';

        let label = `$(${iconId}) Unknown Vulnerability`;
        let description = 'Type Unknown';
        let tooltipMd = `**Severity:** ${escape(vulnerability.currentSeverity || 'Unknown')}`;
        let determinedType: ScanType | undefined;

        // --- Déterminer les détails et le type ---
        const metaType = (vulnerability as any).vulnerability?.vulnerabilityType;

        if (metaType === 'sast' || 'dataFlowItems' in vulnerability) {
            determinedType = 'sast';
            const sastVuln = vulnerability as SastVulnerabilityDetectionDto;
            const fileName = sastVuln.path ? sastVuln.path.split(/[\\/]/).pop() : 'unknown file';
            label = `$(${iconId}) ${sastVuln.vulnerability?.name || sastVuln.id}`;
            description = `${fileName}:${sastVuln.vulnerableStartLine ?? 'N/A'}`;
            tooltipMd += `  \n**Type:** SAST`;
            tooltipMd += `  \n**Rule:** ${escape(sastVuln.vulnerability?.id || 'N/A')}`;
            tooltipMd += `  \n**File:** ${escape(sastVuln.path || 'N/A')}`;
            tooltipMd += `  \n**Language:** ${escape(sastVuln.language || 'N/A')}`;

        } else if (metaType === 'iac') { // Se fier au type du metadata en priorité pour IAC
            determinedType = 'iac';
            const iacVuln = vulnerability as IacVulnerabilityDetectionDto;
            const fileName = iacVuln.path ? iacVuln.path.split(/[\\/]/).pop() : 'unknown file';
            label = `$(${iconId}) ${iacVuln.vulnerability?.name || iacVuln.id}`;
            description = `${fileName}:${iacVuln.vulnerableStartLine ?? 'N/A'}`;
            tooltipMd += `  \n**Type:** IAC`;
            tooltipMd += `  \n**Rule:** ${escape(iacVuln.vulnerability?.id || 'N/A')}`;
            tooltipMd += `  \n**File:** ${escape(iacVuln.path || 'N/A')}`;
            tooltipMd += `  \n**Scanner:** ${escape(iacVuln.scannerType || 'N/A')}`;

        } else if (metaType === 'sca' || 'scaDetectedPackage' in vulnerability) {
            determinedType = 'sca';
            const scaVuln = vulnerability as ScaVulnerabilityWithCvssDto;
            label = `$(${iconId}) ${scaVuln.vulnerability?.name || scaVuln.vulnerability?.cve || scaVuln.id}`;
            description = `${scaVuln.scaDetectedPackage?.packageName || 'Package'} ${scaVuln.scaDetectedPackage?.packageVersion || ''}`;
            tooltipMd += `  \n**Type:** SCA`;
            tooltipMd += `  \n**Package:** ${escape(description)}`;
            tooltipMd += `  \n**CVE:** ${escape(scaVuln.vulnerability?.cve || 'N/A')}`;
            if (scaVuln.cvssScore !== undefined && scaVuln.cvssScore !== null) {
                tooltipMd += `  \n**CVSS:** ${scaVuln.cvssScore}`;
            }
        } else {
            label = `$(${iconId}) ${vulnerability.id}`;
            tooltipMd += '\n**Type:** Unknown (Cannot determine type from data)';
        }

        // Appel super() AVANT d'utiliser 'this'
        super(escape(label), collapsibleState);

        // Maintenant on peut utiliser 'this'
        this.description = escape(description);
        this.tooltip = new vscode.MarkdownString(tooltipMd); // Utiliser MarkdownString
        this.contextValue = 'vulnerability';
        this.vulnerabilityData = vulnerability;
        this.vulnerabilityType = determinedType; // Assigner le type déterminé

        this.command = {
            command: COMMAND_SHOW_DETAILS,
            title: "Show Vulnerability Details",
            arguments: [this.vulnerabilityData, this.vulnerabilityType], // Passe l'objet ET le type
        };
    }
}