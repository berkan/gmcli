// Human approval gate for irreversible actions.
//
// Approval methods, tried in order:
//   1. Local Touch ID helper (~/.gauth/bin/gauth-touchid, macOS host).
//   2. Approval broker over HTTP (containers -> host). Default URL
//      http://host.docker.internal:7331, override with GAUTH_BROKER_URL.
//   3. Passphrase typed on the controlling terminal (/dev/tty). Hash is
//      stored in ~/.gauth/passphrase.json, set with `<tool> approval set-passphrase`.
//
// An explicit denial (Touch ID cancelled, broker said no, wrong passphrase)
// aborts immediately and does NOT fall through to the next method.
// This file is identical in gmcli, gccli and gdcli.

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as tty from "tty";

const GAUTH_DIR = path.join(os.homedir(), ".gauth");
const PASSPHRASE_FILE = path.join(GAUTH_DIR, "passphrase.json");
const HELPER_PATH = path.join(GAUTH_DIR, "bin", "gauth-touchid");
const BROKER_URL = process.env.GAUTH_BROKER_URL || "http://host.docker.internal:7331";
const HELPER_TIMEOUT_MS = 120_000;
const BROKER_TIMEOUT_MS = 150_000;
const MAX_REASON_LENGTH = 400;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

export interface ApprovalRequest {
	tool: string; // e.g. "gmcli"
	account: string; // account email the action runs as
	action: string; // e.g. "send", "drafts delete"
	details: string[]; // human-readable lines describing exactly what will happen
}

export class ApprovalDenied extends Error {}

export async function requireApproval(req: ApprovalRequest): Promise<void> {
	const summary = `${req.tool} ${req.action} as ${req.account}`;
	const reason = truncate([summary, ...req.details].join(" | "), MAX_REASON_LENGTH);

	console.error("");
	console.error(`APPROVAL REQUIRED: ${summary}`);
	for (const d of req.details) console.error(`  ${d}`);

	if (fs.existsSync(HELPER_PATH)) {
		const result = runHelper(reason);
		if (result === "approved") return;
		if (result === "denied") throw new ApprovalDenied("Denied via Touch ID");
	} else if (process.platform !== "darwin") {
		const result = await askBroker(req, reason);
		if (result === "approved") return;
		if (result === "denied") throw new ApprovalDenied("Denied via approval broker");
	}

	await askPassphrase(req.tool);
}

type MethodResult = "approved" | "denied" | "unavailable";

function runHelper(reason: string): MethodResult {
	const r = spawnSync(HELPER_PATH, [reason], { timeout: HELPER_TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] });
	if (r.status === 0) {
		console.error("Approved (Touch ID)");
		return "approved";
	}
	if (r.status === 1) return "denied";
	const msg = (r.stderr?.toString() || r.error?.message || `exit ${r.status}`).trim();
	console.error(`Touch ID unavailable: ${msg}`);
	return "unavailable";
}

async function askBroker(req: ApprovalRequest, reason: string): Promise<MethodResult> {
	let response: Response;
	try {
		response = await fetch(`${BROKER_URL}/approve`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...req, reason }),
			signal: AbortSignal.timeout(BROKER_TIMEOUT_MS),
		});
	} catch (e) {
		console.error(`Approval broker unreachable at ${BROKER_URL}: ${e instanceof Error ? e.message : e}`);
		return "unavailable";
	}
	let body: any = {};
	try {
		body = await response.json();
	} catch {
		// fall through with empty body
	}
	if (response.ok && body.approved === true) {
		console.error("Approved (Touch ID via broker)");
		return "approved";
	}
	if (response.ok && body.approved === false) return "denied";
	console.error(`Approval broker error: ${body.error || response.status}`);
	return "unavailable";
}

async function askPassphrase(tool: string): Promise<void> {
	const stored = readPassphraseFile();
	if (!stored) {
		throw new Error(
			`No approval method available: Touch ID/broker unreachable and no passphrase set. Run: ${tool} approval set-passphrase`,
		);
	}
	const term = Terminal.open();
	if (!term) {
		throw new Error("No approval method available: Touch ID/broker unreachable and no terminal for passphrase");
	}
	try {
		for (let attempt = 0; attempt < 3; attempt++) {
			const input = await term.readSecret("Approval passphrase: ");
			if (verifyPassphrase(input, stored)) {
				console.error("Approved (passphrase)");
				return;
			}
			term.write("Wrong passphrase\n");
		}
	} finally {
		term.close();
	}
	throw new ApprovalDenied("Passphrase rejected");
}

// --- passphrase storage ---

interface StoredPassphrase {
	salt: string;
	hash: string;
}

function readPassphraseFile(): StoredPassphrase | null {
	try {
		const data = JSON.parse(fs.readFileSync(PASSPHRASE_FILE, "utf8"));
		if (typeof data.salt === "string" && typeof data.hash === "string") return data;
	} catch {
		// missing or unreadable
	}
	return null;
}

function hashPassphrase(passphrase: string, salt: Buffer): string {
	return crypto.scryptSync(passphrase, salt, 32, SCRYPT_PARAMS).toString("hex");
}

function verifyPassphrase(passphrase: string, stored: StoredPassphrase): boolean {
	const expected = Buffer.from(stored.hash, "hex");
	const actual = Buffer.from(hashPassphrase(passphrase, Buffer.from(stored.salt, "hex")), "hex");
	return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function writePassphraseFile(passphrase: string): void {
	const salt = crypto.randomBytes(16);
	fs.mkdirSync(GAUTH_DIR, { recursive: true, mode: 0o700 });
	fs.writeFileSync(
		PASSPHRASE_FILE,
		JSON.stringify({ salt: salt.toString("hex"), hash: hashPassphrase(passphrase, salt) }, null, 2),
		{ mode: 0o600 },
	);
}

// --- terminal input that bypasses stdin (agents pipe stdin; humans have /dev/tty) ---

class Terminal {
	private input: tty.ReadStream;
	private pending = ""; // raw input received but not yet consumed by a reader
	private waiter: (() => void) | null = null;

	private constructor(private fd: number) {
		this.input = new tty.ReadStream(fd);
		this.input.setRawMode(true);
		// Keep the stream flowing for the Terminal's lifetime: this buffers input
		// that arrives in one chunk and keeps the event loop alive while a reader waits.
		this.input.on("data", (chunk: Buffer) => {
			this.pending += chunk.toString("utf8");
			this.waiter?.();
		});
	}

	static open(): Terminal | null {
		try {
			return new Terminal(fs.openSync("/dev/tty", "r+"));
		} catch {
			return null;
		}
	}

	write(s: string): void {
		fs.writeSync(this.fd, s);
	}

	/** Read one line without echo. Enter submits, backspace edits, Ctrl-C aborts. */
	readSecret(prompt: string): Promise<string> {
		this.write(prompt);
		return new Promise((resolve, reject) => {
			const tryTakeLine = () => {
				let line = "";
				for (let i = 0; i < this.pending.length; i++) {
					const ch = this.pending[i];
					if (ch === "\r" || ch === "\n") {
						// treat "\r\n" as a single terminator
						const skip = ch === "\r" && this.pending[i + 1] === "\n" ? 2 : 1;
						this.pending = this.pending.slice(i + skip);
						this.waiter = null;
						this.write("\n");
						resolve(line);
						return;
					}
					if (ch === "\u0003") {
						this.pending = "";
						this.waiter = null;
						this.write("\n");
						reject(new ApprovalDenied("Interrupted"));
						return;
					}
					if (ch === "\u007f" || ch === "\b") {
						line = line.slice(0, -1);
					} else {
						line += ch;
					}
				}
				// no complete line yet; wait for more input
				this.waiter = tryTakeLine;
			};
			tryTakeLine();
		});
	}

	close(): void {
		this.input.setRawMode(false);
		this.input.destroy();
	}
}

// --- `<tool> approval <action>` subcommand ---

export async function handleApprovalCommand(tool: string, args: string[]): Promise<void> {
	switch (args[0]) {
		case "set-passphrase": {
			const term = Terminal.open();
			if (!term) throw new Error("A terminal is required to set the passphrase");
			try {
				const a = await term.readSecret("New approval passphrase: ");
				const b = await term.readSecret("Repeat: ");
				if (a !== b) throw new Error("Passphrases do not match");
				if (a.length < 8) throw new Error("Passphrase must be at least 8 characters");
				writePassphraseFile(a);
			} finally {
				term.close();
			}
			console.log(`Passphrase saved to ${PASSPHRASE_FILE}`);
			break;
		}
		case "status": {
			console.log(`Touch ID helper: ${fs.existsSync(HELPER_PATH) ? HELPER_PATH : "not installed"}`);
			console.log(`Broker URL:      ${BROKER_URL} (${await brokerHealth()})`);
			console.log(`Passphrase:      ${readPassphraseFile() ? "set" : "not set"}`);
			console.log(`Terminal:        ${fs.existsSync("/dev/tty") ? "/dev/tty present" : "none"}`);
			break;
		}
		case "test": {
			await requireApproval({ tool, account: "(none)", action: "test", details: ["No action will be taken"] });
			console.log("Approval succeeded");
			break;
		}
		default:
			throw new Error(`Usage: ${tool} approval set-passphrase | status | test`);
	}
}

async function brokerHealth(): Promise<string> {
	try {
		const r = await fetch(`${BROKER_URL}/health`, { signal: AbortSignal.timeout(3000) });
		const body: any = await r.json();
		return r.ok ? `reachable, helper ${body.helper ? "installed" : "missing"}` : `HTTP ${r.status}`;
	} catch (e) {
		return `unreachable: ${e instanceof Error ? e.message : e}`;
	}
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
