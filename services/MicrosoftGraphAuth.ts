import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  PublicClientApplication,
  type AccountInfo,
  type DeviceCodeRequest,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";

const graphScopes = ["Tasks.ReadWrite"];

export interface MicrosoftGraphAuthOptions {
  readonly clientId: string;
  readonly tenantId: string;
  readonly tokenCachePath: string;
  readonly onDeviceCode?: (message: string) => void;
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

class FileTokenCachePlugin implements ICachePlugin {
  constructor(private readonly path: string) {}

  async beforeCacheAccess(context: TokenCacheContext): Promise<void> {
    try {
      context.tokenCache.deserialize(await readFile(this.path, "utf8"));
    } catch (error: unknown) {
      if (!isMissingFile(error)) throw error;
    }
  }

  async afterCacheAccess(context: TokenCacheContext): Promise<void> {
    if (!context.cacheHasChanged) return;
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, context.tokenCache.serialize(), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.path);
  }
}

export class MicrosoftGraphAuth implements AccessTokenProvider {
  private readonly application: PublicClientApplication;
  private readonly onDeviceCode: (message: string) => void;

  constructor(options: MicrosoftGraphAuthOptions) {
    this.onDeviceCode =
      options.onDeviceCode ??
      ((message) => process.stderr.write(`${message}\n`));
    this.application = new PublicClientApplication({
      auth: {
        clientId: options.clientId,
        authority: `https://login.microsoftonline.com/${encodeURIComponent(options.tenantId)}`,
      },
      cache: { cachePlugin: new FileTokenCachePlugin(options.tokenCachePath) },
    });
  }

  async getAccessToken(): Promise<string> {
    const account = await this.firstAccount();
    if (account) {
      try {
        const result = await this.application.acquireTokenSilent({
          account,
          scopes: graphScopes,
        });
        if (result?.accessToken) return result.accessToken;
      } catch {
        // Interactive device-code authentication below refreshes an expired/invalid cached session.
      }
    }

    const result = await this.application.acquireTokenByDeviceCode({
      scopes: graphScopes,
      deviceCodeCallback: (
        response: Parameters<DeviceCodeRequest["deviceCodeCallback"]>[0],
      ) => this.onDeviceCode(response.message),
    });
    if (!result?.accessToken)
      throw new Error("Microsoft OAuth did not return an access token");
    return result.accessToken;
  }

  private async firstAccount(): Promise<AccountInfo | null> {
    const accounts = await this.application.getTokenCache().getAllAccounts();
    return accounts[0] ?? null;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
