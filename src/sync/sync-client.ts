/**
 * HTTP sync client using Obsidian's requestUrl API.
 */

import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import type { ManifestFileRecord, VaultManifest } from "./sync-types";

export interface SyncClientConfig {
	serverUrl: string;
	auth?: {
		username: string;
		password: string;
	};
	timeout?: number;
}

export interface PropfindEntry {
	href: string;
	status: string;
	size: number;
	lastModified: string;
}

interface RequestOptions {
	headers?: Record<string, string>;
	body?: string | ArrayBuffer;
	allowStatuses?: number[];
}

export class SyncClient {
	private config: SyncClientConfig;
	private readonly defaultTimeout = 30000;

	constructor(config: SyncClientConfig) {
		this.config = config;
	}

	updateConfig(config: SyncClientConfig): void {
		this.config = config;
	}

	getServerUrl(): string {
		return this.normalizeServerUrl(this.config.serverUrl);
	}

	async healthCheck(): Promise<{ status: string; vault: string }> {
		const response = await this.request("/.clawvault/health", "GET");
		const payload = this.safeJson(response.text);
		if (!payload || typeof payload !== "object") {
			throw new Error("Unexpected health response");
		}

		const status = this.readString(payload, ["status"]) ?? "unknown";
		const vault = this.readString(payload, ["vault", "name"]) ?? "unknown";
		return { status, vault };
	}

	async fetchManifest(): Promise<VaultManifest> {
		const response = await this.request("/.clawvault/manifest", "GET");
		const payload = this.safeJson(response.text);
		if (!payload) {
			throw new Error("Manifest response was empty");
		}
		return this.normalizeManifest(payload);
	}

	async getFile(remotePath: string): Promise<string> {
		const response = await this.request(this.toWebDavPath(remotePath), "GET");
		return response.text;
	}

	async getFileBinary(remotePath: string): Promise<ArrayBuffer> {
		const response = await this.request(this.toWebDavPath(remotePath), "GET");
		return response.arrayBuffer;
	}

	async putFile(remotePath: string, content: string): Promise<void> {
		await this.putFileInternal(remotePath, content);
	}

	async putFileBinary(remotePath: string, content: ArrayBuffer): Promise<void> {
		await this.putFileInternal(remotePath, content);
	}

	async deleteFile(remotePath: string): Promise<void> {
		await this.request(this.toWebDavPath(remotePath), "DELETE", {
			allowStatuses: [200, 202, 204, 404],
		});
	}

	async propfind(remotePath: string, depth = "1"): Promise<PropfindEntry[]> {
		const response = await this.request(this.toWebDavPath(remotePath), "PROPFIND", {
			headers: {
				Depth: depth,
				"Content-Type": "application/xml; charset=utf-8",
			},
			body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getcontentlength />
    <d:getlastmodified />
  </d:prop>
</d:propfind>`,
			allowStatuses: [200, 207],
		});
		return this.parsePropfind(response.text);
	}

	async getFilesBatch(paths: string[]): Promise<Map<string, string>> {
		const results = new Map<string, string>();
		for (const path of paths) {
			results.set(path, await this.getFile(path));
		}
		return results;
	}

	private async putFileInternal(remotePath: string, content: string | ArrayBuffer): Promise<void> {
		await this.ensureRemoteDirectories(remotePath);
		await this.request(this.toWebDavPath(remotePath), "PUT", {
			headers: {
				"Content-Type": "application/octet-stream",
			},
			body: content,
			allowStatuses: [200, 201, 204],
		});
	}

	private async ensureRemoteDirectories(remotePath: string): Promise<void> {
		const normalized = this.normalizePath(remotePath);
		const segments = normalized.split("/").filter((segment) => segment.length > 0);
		if (segments.length <= 1) return;

		let current = "";
		for (let i = 0; i < segments.length - 1; i++) {
			const segment = segments[i];
			if (!segment) continue;
			current = current ? `${current}/${segment}` : segment;
			await this.request(this.toWebDavPath(current), "MKCOL", {
				allowStatuses: [201, 301, 405, 409],
			});
		}
	}

	private async request(
		path: string,
		method: string,
		options: RequestOptions = {}
	): Promise<RequestUrlResponse> {
		const url = this.buildUrl(path);
		const headers = {
			...this.buildAuthHeaders(),
			...options.headers,
		};

		const requestParams: RequestUrlParam = {
			url,
			method,
			headers,
			throw: false,
		};

		if (typeof options.body !== "undefined") {
			requestParams.body = options.body;
		}

		const response = await this.requestWithTimeout(requestParams);
		const allowedStatuses = options.allowStatuses ?? [];
		const isAllowed = allowedStatuses.includes(response.status);
		if (response.status >= 400 && !isAllowed) {
			throw new Error(`${method} ${path} failed with ${response.status}`);
		}

		return response;
	}

	private async requestWithTimeout(params: RequestUrlParam): Promise<RequestUrlResponse> {
		let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
		const timeoutMs = this.config.timeout ?? this.defaultTimeout;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(new Error(`Request timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});

		try {
			return await Promise.race([requestUrl(params), timeoutPromise]);
		} finally {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
		}
	}

	private buildAuthHeaders(): Record<string, string> {
		const auth = this.config.auth;
		if (!auth || (!auth.username && !auth.password)) {
			return {};
		}

		const raw = `${auth.username}:${auth.password}`;
		const bytes = new TextEncoder().encode(raw);
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}

		return { Authorization: `Basic ${btoa(binary)}` };
	}

	private buildUrl(path: string): string {
		const base = this.normalizeServerUrl(this.config.serverUrl);
		if (!base) {
			throw new Error("Sync server URL is not configured");
		}

		const normalizedPath = path.startsWith("/") ? path : `/${path}`;
		return `${base}${normalizedPath}`;
	}

	private normalizeServerUrl(url: string): string {
		return url.trim().replace(/\/+$/, "");
	}

	private toWebDavPath(remotePath: string): string {
		const normalized = this.normalizePath(remotePath);
		if (!normalized) {
			return "/webdav/";
		}

		const encoded = normalized
			.split("/")
			.filter((segment) => segment.length > 0)
			.map((segment) => encodeURIComponent(segment))
			.join("/");
		return `/webdav/${encoded}`;
	}

	private normalizePath(path: string): string {
		return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
	}

	private parsePropfind(xml: string): PropfindEntry[] {
		const parser = new DOMParser();
		const document = parser.parseFromString(xml, "application/xml");
		const responses = Array.from(document.getElementsByTagName("response"));
		const entries: PropfindEntry[] = [];

		for (const response of responses) {
			const href = response.getElementsByTagName("href")[0]?.textContent?.trim() ?? "";
			const status = response.getElementsByTagName("status")[0]?.textContent?.trim() ?? "";
			const sizeText =
				response.getElementsByTagName("getcontentlength")[0]?.textContent?.trim() ?? "0";
			const lastModified =
				response.getElementsByTagName("getlastmodified")[0]?.textContent?.trim() ?? "";
			const size = Number.parseInt(sizeText, 10);

			entries.push({
				href,
				status,
				size: Number.isFinite(size) ? size : 0,
				lastModified,
			});
		}

		return entries;
	}

	private safeJson(value: string): unknown {
		try {
			return JSON.parse(value) as unknown;
		} catch {
			return null;
		}
	}

	private normalizeManifest(payload: unknown): VaultManifest {
		const source = this.toRecord(payload);
		if (!source) {
			throw new Error("Manifest payload is not an object");
		}

		const files: ManifestFileRecord[] = [];
		const rawFiles = source["files"];

		if (Array.isArray(rawFiles)) {
			for (const rawFile of rawFiles) {
				const parsed = this.parseManifestFile(rawFile);
				if (parsed) {
					files.push(parsed);
				}
			}
		} else {
			const fileMap = this.toRecord(rawFiles);
			const candidates = fileMap ?? source;
			for (const [path, value] of Object.entries(candidates)) {
				if (this.isMetadataKey(path)) {
					continue;
				}
				if (!this.looksLikeFilePath(path) && fileMap === null) {
					continue;
				}
				const parsed = this.parseManifestFile(value, path);
				if (parsed) {
					files.push(parsed);
				}
			}
		}

		const generatedAt =
			this.readString(source, ["generatedAt", "timestamp", "updatedAt"]) ??
			new Date().toISOString();

		return { generatedAt, files };
	}

	private isMetadataKey(key: string): boolean {
		return [
			"generatedAt",
			"timestamp",
			"updatedAt",
			"files",
			"vault",
			"name",
			"stats",
			"version",
		].includes(key);
	}

	private looksLikeFilePath(value: string): boolean {
		return value.includes("/") || value.includes(".") || value.startsWith("_");
	}

	private parseManifestFile(rawValue: unknown, keyPath?: string): ManifestFileRecord | null {
		const record = this.toRecord(rawValue);
		if (!record && !keyPath) {
			return null;
		}

		const path = this.normalizePath(
			this.readString(record, ["path", "file", "name"]) ?? keyPath ?? ""
		);
		if (!path) {
			return null;
		}

		const checksum = this.readString(record, ["checksum", "hash", "sha256"]) ?? "";
		const modified =
			this.readString(record, ["modified", "mtime", "updatedAt", "lastModified"]) ??
			new Date(0).toISOString();
		const size = this.readNumber(record, ["size", "bytes"]) ?? 0;
		const category = this.readString(record, ["category"]) ?? path.split("/")[0] ?? undefined;

		return {
			path,
			checksum,
			modified,
			size,
			category,
		};
	}

	private readString(source: Record<string, unknown> | null, keys: string[]): string | null {
		if (!source) return null;
		for (const key of keys) {
			const value = source[key];
			if (typeof value === "string" && value.trim().length > 0) {
				return value;
			}
		}
		return null;
	}

	private readNumber(source: Record<string, unknown> | null, keys: string[]): number | null {
		if (!source) return null;
		for (const key of keys) {
			const value = source[key];
			if (typeof value === "number" && Number.isFinite(value)) {
				return value;
			}
			if (typeof value === "string" && value.trim().length > 0) {
				const parsed = Number.parseFloat(value);
				if (Number.isFinite(parsed)) {
					return parsed;
				}
			}
		}
		return null;
	}

	private toRecord(value: unknown): Record<string, unknown> | null {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return null;
		}
		return value as Record<string, unknown>;
	}
}

