export interface ApprovalRequest {
    tool: string;
    account: string;
    action: string;
    details: string[];
}
export declare class ApprovalDenied extends Error {
}
export declare function requireApproval(req: ApprovalRequest): Promise<void>;
export declare function handleApprovalCommand(tool: string, args: string[]): Promise<void>;
//# sourceMappingURL=approval.d.ts.map