import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const CONFIG_DIR = path.join(os.homedir(), ".gmcli");
const ACCOUNTS_FILE = path.join(CONFIG_DIR, "accounts.json");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");
export class AccountStorage {
    accounts = new Map();
    constructor() {
        this.ensureConfigDir();
        this.loadAccounts();
    }
    ensureConfigDir() {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
    }
    loadAccounts() {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
                for (const account of data) {
                    this.accounts.set(account.email, account);
                }
            }
            catch {
                // Ignore
            }
        }
    }
    saveAccounts() {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(Array.from(this.accounts.values()), null, 2));
    }
    addAccount(account) {
        this.accounts.set(account.email, account);
        this.saveAccounts();
    }
    getAccount(email) {
        return this.accounts.get(email);
    }
    getAllAccounts() {
        return Array.from(this.accounts.values());
    }
    deleteAccount(email) {
        const deleted = this.accounts.delete(email);
        if (deleted)
            this.saveAccounts();
        return deleted;
    }
    hasAccount(email) {
        return this.accounts.has(email);
    }
    setCredentials(clientId, clientSecret) {
        fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify({ clientId, clientSecret }, null, 2));
    }
    getCredentials() {
        if (!fs.existsSync(CREDENTIALS_FILE))
            return null;
        try {
            return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=account-storage.js.map