export declare class GmailOAuthFlow {
    private oauth2Client;
    private server;
    private timeoutId;
    constructor(clientId: string, clientSecret: string);
    authorize(manual?: boolean): Promise<string>;
    private startManualFlow;
    private startAuthFlow;
    private handleCallback;
    private cleanup;
    private openBrowser;
}
//# sourceMappingURL=gmail-oauth-flow.d.ts.map