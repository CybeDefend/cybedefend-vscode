// src/test/mocks/mockVulnerabilities.ts
import {
    DetailedVulnerability,
    SastVulnerabilityDetectionDto,
    IacVulnerabilityDetectionDto,
    ScaVulnerabilityWithCvssDto,
    VulnerabilitySeverityEnum,
    VulnerabilityStatusEnum,
    VulnerabilityPriorityEnum
} from '../../dtos/result/details'; // Ajuste le chemin si nécessaire
import { GetProjectVulnerabilitiesResponseDto, ScanProjectInfoDto, CountVulnerabilitiesCountByType } from '../../dtos/result/response/get-project-vulnerabilities-response.dto'; // Ajuste le chemin

// --- Exemples de Données Mock ---

const mockSastVuln: SastVulnerabilityDetectionDto = {
    id: 'sast-vuln-uuid-1',
    projectId: 'mock-project-id',
    createdAt: new Date().toISOString(),
    updateAt: new Date().toISOString(),
    currentState: VulnerabilityStatusEnum.TO_VERIFY,
    currentSeverity: VulnerabilitySeverityEnum.HIGH,
    currentPriority: VulnerabilityPriorityEnum.URGENT,
    contextualExplanation: 'This seems like a SQL injection vulnerability.',
    language: 'typescript',
    path: 'src/controllers/user.controller.ts',
    vulnerableStartLine: 42,
    vulnerableEndLine: 42,
    scannerType: 'Semgrep',
    vulnerability: {
        id: 'rule-sql-injection',
        cwe: ['CWE-89'],
        name: 'SQL Injection',
        shortDescription: 'User input directly used in SQL query.',
        description: 'A potential SQL injection vulnerability was detected. User input from the request is used to construct a database query without proper sanitization, potentially allowing attackers to execute arbitrary SQL commands.',
        howToPrevent: 'Use parameterized queries or prepared statements. Properly sanitize and validate all user inputs before incorporating them into database queries.',
        owaspTop10: ['A03:2021-Injection'],
        severity: VulnerabilitySeverityEnum.HIGH,
        language: 'typescript',
        vulnerabilityType: 'sast',
    },
    historyItems: [
        { id: 'hist-sast-1', type: 'CREATE', value: 'Detected', date: new Date().toISOString(), userId: null, user: null }
    ],
    codeSnippets: [
        {
            id: 'snip-sast-1', vulnerableStartLine: 42, vulnerableEndLine: 42, startLine: 40, endLine: 45, language: 'typescript',
            code: [
                { line: 40, content: '...' },
                { line: 41, content: 'const userId = req.query.id;' },
                { line: 42, content: 'const query = `SELECT * FROM users WHERE id = ${userId}`;' }, // Ligne vulnérable
                { line: 43, content: 'const user = await db.query(query);' },
                { line: 44, content: '...' },
                { line: 45, content: '}' },
            ]
        }
    ],
    dataFlowItems: [
        { id: 'flow-1', nameHighlight: 'req.query.id', line: 41, language: 'typescript', code: [{line: 41, content:'const userId = req.query.id;'}], type: 'source', order: 1 },
        { id: 'flow-2', nameHighlight: 'query', line: 42, language: 'typescript', code: [{line: 42, content:'const query = `SELECT * FROM users WHERE id = ${userId}`;'}], type: 'sink', order: 2 },
    ]
};

const mockIacVuln: IacVulnerabilityDetectionDto = {
    id: 'iac-vuln-uuid-1',
    projectId: 'mock-project-id',
    createdAt: new Date().toISOString(),
    updateAt: new Date().toISOString(),
    currentState: VulnerabilityStatusEnum.TO_VERIFY,
    currentSeverity: VulnerabilitySeverityEnum.MEDIUM,
    currentPriority: VulnerabilityPriorityEnum.NORMAL,
    contextualExplanation: 'S3 bucket without public access block.',
    language: 'terraform',
    path: 'infra/s3.tf',
    vulnerableStartLine: 15,
    vulnerableEndLine: 20,
    scannerType: 'Trivy',
    vulnerability: {
        id: 'aws-s3-no-public-block',
        cwe: ['CWE-284'], // Improper Access Control
        name: 'S3 Bucket Public Access',
        shortDescription: 'S3 bucket may be publicly accessible.',
        description: 'The S3 bucket configuration does not explicitly block public access. This could lead to unintentional data exposure if bucket policies or ACLs are misconfigured.',
        howToPrevent: 'Enable the `block_public_acls`, `block_public_policy`, `ignore_public_acls`, and `restrict_public_buckets` arguments in the `aws_s3_bucket_public_access_block` resource.',
        severity: VulnerabilitySeverityEnum.MEDIUM,
        language: 'terraform',
        vulnerabilityType: 'iac',
    },
    historyItems: [
         { id: 'hist-iac-1', type: 'CREATE', value: 'Detected', date: new Date().toISOString(), userId: null, user: null }
    ],
    codeSnippets: [
         {
             id: 'snip-iac-1', vulnerableStartLine: 15, vulnerableEndLine: 20, startLine: 13, endLine: 22, language: 'terraform',
             code: [
                 { line: 13, content: 'resource "aws_s3_bucket" "data" {' },
                 { line: 14, content: '  bucket = "my-data-bucket"' },
                 { line: 15, content: '  // Missing public access block configuration' },
                 { line: 16, content: '  tags = {' },
                 { line: 17, content: '    Environment = "Prod"' },
                 { line: 18, content: '  }' },
                 { line: 19, content: '}' },
                 { line: 20, content: ''},
                 { line: 21, content: '# Recommendation: Add aws_s3_bucket_public_access_block resource'},
                 { line: 22, content: '# resource "aws_s3_bucket_public_access_block" "data_public_access" { ... }'},
             ]
         }
    ],
    // Pas de dataFlowItems pour IAC
};

const mockScaVuln: ScaVulnerabilityWithCvssDto = {
    id: 'sca-vuln-uuid-1',
    projectId: 'mock-project-id',
    createdAt: new Date().toISOString(),
    updateAt: new Date().toISOString(),
    currentState: VulnerabilityStatusEnum.CONFIRMED,
    currentSeverity: VulnerabilitySeverityEnum.CRITICAL,
    currentPriority: VulnerabilityPriorityEnum.CRITICAL_URGENT,
    scaDetectedPackage: { // Utilise ScaDetectedLibraryDto
        id: 'sca-pkg-1',
        projectId: 'mock-project-id',
        packageName: 'lodash',
        packageVersion: '4.17.10', // Version vulnérable exemple
        fileName: 'package-lock.json',
        ecosystem: 'npm'
    },
    vulnerability: { // Utilise VulnerabilityScaMetadataDto
        id: 'CVE-2019-10744', // Exemple de CVE réel pour lodash < 4.17.12
        cwe: ['CWE-400'], // Uncontrolled Resource Consumption
        name: 'Prototype Pollution in lodash',
        shortDescription: 'Potential prototype pollution vulnerability.',
        description: 'Versions of lodash prior to 4.17.12 are vulnerable to Prototype Pollution via utility functions like defaultsDeep, merge, and others.',
        howToPrevent: 'Upgrade lodash to version 4.17.12 or later.',
        severity: VulnerabilitySeverityEnum.CRITICAL, // La sévérité peut venir de différentes sources (NVD, GitHub...)
        language: 'javascript', // Ou 'npm' / 'node'
        vulnerabilityType: 'sca',
        cve: 'CVE-2019-10744',
        internalId: 'ghsa-jf85-cpcp-j695', // Exemple GitHub Advisory ID
        summary: 'Prototype Pollution in lodash allows attackers to modify the prototype of base objects.',
        severityGh: 'HIGH', // Exemple Sévérité GitHub
        schemaVersion: '1.0',
        // Les autres champs de VulnerabilityScaMetadataDto peuvent être ajoutés si nécessaire
        aliases: [], cwes: [], references: [], severities: [], packages: [] // Initialise les tableaux vides
    },
    historyItems: [
        { id: 'hist-sca-1', type: 'CREATE', value: 'Detected in package-lock.json', date: new Date().toISOString(), userId: null, user: null },
        { id: 'hist-sca-2', type: 'STATUS_CHANGE', value: 'Confirmed', date: new Date().toISOString(), userId: 'user-uuid-123', user: { id:'user-1', firstName:'John', lastName:'Doe', email:'j.doe@test.com', picture:''} }
    ],
    cvssScore: 9.8 // Exemple de score CVSS
    // Pas de codeSnippets ou dataFlowItems pour SCA
};


// --- Tableau Mock Complet ---
export const mockVulnerabilities: DetailedVulnerability[] = [
    mockSastVuln,
    mockIacVuln,
    mockScaVuln,
    // Ajoute d'autres exemples avec différentes sévérités, types, etc.
    // Exemple Low SAST
    { ...mockSastVuln, id: 'sast-low-1', currentSeverity: VulnerabilitySeverityEnum.LOW, currentPriority: VulnerabilityPriorityEnum.LOW, path: 'src/utils/helpers.ts', vulnerableStartLine: 10, vulnerability: { ...mockSastVuln.vulnerability, id: 'rule-weak-rng', name: 'Weak Random Number Generator', severity: VulnerabilitySeverityEnum.LOW }},
];

// --- Fonction pour créer une réponse mockée ---
export function createMockVulnerabilitiesResponse(projectId: string): GetProjectVulnerabilitiesResponseDto {
    const response = new GetProjectVulnerabilitiesResponseDto(
        projectId,
        'Mock Project Name',
        1, // page
        mockVulnerabilities.length, // limit (ou total)
        1, // totalPages
        'severity', // sort
        'desc', // order
        [VulnerabilitySeverityEnum.CRITICAL, VulnerabilitySeverityEnum.HIGH, VulnerabilitySeverityEnum.MEDIUM, VulnerabilitySeverityEnum.LOW], // severity filter example
        [VulnerabilityStatusEnum.TO_VERIFY, VulnerabilityStatusEnum.CONFIRMED], // status filter example
        'all', // language filter example
        [], // priority filter example
        mockVulnerabilities, // Les données mockées
        mockVulnerabilities.length, // total
        new ScanProjectInfoDto( // Infos de scan mockées
             'mock-scan-id-' + Date.now(),
             'COMPLETED',
             new Date(),
             'sast,iac,sca'
         ),
        new CountVulnerabilitiesCountByType( // Comptes mockés
             mockVulnerabilities.filter(v => v.vulnerability?.vulnerabilityType === 'sast').length,
             mockVulnerabilities.filter(v => v.vulnerability?.vulnerabilityType === 'iac').length,
             mockVulnerabilities.filter(v => v.vulnerability?.vulnerabilityType === 'sca').length,
         )
    );
    return response;
}