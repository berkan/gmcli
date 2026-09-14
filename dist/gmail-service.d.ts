import { type gmail_v1 } from "googleapis";
import type { EmailAccount } from "./types.js";
type GmailMessage = gmail_v1.Schema$Message;
type GmailThread = gmail_v1.Schema$Thread;
type GmailDraft = gmail_v1.Schema$Draft;
export interface ThreadSearchResult {
    threads: Array<{
        id: string;
        historyId: string;
        messages: Array<{
            id: string;
            threadId: string;
            labelIds: string[];
            snippet: string;
            historyId: string;
            internalDate: string;
            from: string | undefined;
            to: string | undefined;
            subject: string | undefined;
            date: string | undefined;
            hasAttachments: boolean;
        }>;
    }>;
    nextPageToken?: string;
}
export interface AttachmentDownloadResult {
    success: boolean;
    filename: string;
    path?: string;
    error?: string;
    cached?: boolean;
}
export interface DownloadedAttachment {
    messageId: string;
    filename: string;
    path: string;
    size: number;
    mimeType: string;
    cached: boolean;
}
export interface LabelOperationResult {
    threadId: string;
    success: boolean;
    error?: string;
}
export declare class GmailService {
    private accountStorage;
    private gmailClients;
    /** Re-run the OAuth flow for an existing account and replace its refresh token. */
    reauthAccount(email: string, manual?: boolean): Promise<void>;
    addGmailAccount(email: string, clientId: string, clientSecret: string, manual?: boolean): Promise<void>;
    deleteAccount(email: string): boolean;
    listAccounts(): EmailAccount[];
    setCredentials(clientId: string, clientSecret: string): void;
    getCredentials(): {
        clientId: string;
        clientSecret: string;
    } | null;
    /** Ensure the Google account that granted the token is the one we are about to store it under. */
    private verifyIdentity;
    private getGmailClient;
    searchThreads(email: string, query: string, maxResults?: number, pageToken?: string): Promise<ThreadSearchResult>;
    getThread(email: string, threadId: string, downloadAttachments?: boolean): Promise<GmailThread | DownloadedAttachment[]>;
    downloadAttachments(email: string, attachments: Array<{
        messageId: string;
        attachmentId: string;
        filename: string;
    }>): Promise<AttachmentDownloadResult[]>;
    modifyLabels(email: string, threadIds: string[], addLabels?: string[], removeLabels?: string[]): Promise<LabelOperationResult[]>;
    listDrafts(email: string): Promise<GmailDraft[]>;
    listLabels(email: string): Promise<Array<{
        id: string;
        name: string;
        type: string;
    }>>;
    getLabelMap(email: string): Promise<{
        idToName: Map<string, string>;
        nameToId: Map<string, string>;
    }>;
    resolveLabelIds(labels: string[], nameToId: Map<string, string>): string[];
    createDraft(email: string, to: string[], subject: string, body: string, options?: {
        cc?: string[];
        bcc?: string[];
        threadId?: string;
        replyToMessageId?: string;
        attachments?: string[];
    }): Promise<GmailDraft>;
    private getMimeType;
    updateDraft(email: string, draftId: string, body: string): Promise<GmailDraft>;
    getDraft(email: string, draftId: string): Promise<GmailDraft>;
    deleteDraft(email: string, draftId: string): Promise<void>;
    sendDraft(email: string, draftId: string): Promise<GmailMessage>;
    sendMessage(email: string, to: string[], subject: string, body: string, options?: {
        cc?: string[];
        bcc?: string[];
        replyToMessageId?: string;
        attachments?: string[];
    }): Promise<GmailMessage>;
    downloadMessageAttachments(email: string, messageId: string): Promise<DownloadedAttachment[]>;
    private getHeaderValue;
}
export {};
//# sourceMappingURL=gmail-service.d.ts.map