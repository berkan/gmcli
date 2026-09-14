import type { EmailAccount } from "./types.js";
export declare class AccountStorage {
    private accounts;
    constructor();
    private ensureConfigDir;
    private loadAccounts;
    private saveAccounts;
    addAccount(account: EmailAccount): void;
    getAccount(email: string): EmailAccount | undefined;
    getAllAccounts(): EmailAccount[];
    deleteAccount(email: string): boolean;
    hasAccount(email: string): boolean;
    setCredentials(clientId: string, clientSecret: string): void;
    getCredentials(): {
        clientId: string;
        clientSecret: string;
    } | null;
}
//# sourceMappingURL=account-storage.d.ts.map