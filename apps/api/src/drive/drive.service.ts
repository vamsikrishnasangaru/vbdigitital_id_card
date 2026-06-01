import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

@Injectable()
export class DriveService implements OnModuleInit {
  private readonly logger = new Logger(DriveService.name);
  private drive: drive_v3.Drive;
  private isConfigured = false;
  /** OAuth uploads use the signed-in user's storage (required for personal Gmail). */
  private usesUserOAuth = false;
  private rootFolderId: string | undefined;
  private sharedDriveId: string | undefined;

  isDriveEnabled(): boolean {
    return this.isConfigured;
  }

  /** True when uploads can use user OAuth or a Workspace shared drive (not service-account-only). */
  canUploadToDrive(): boolean {
    return this.isConfigured && (this.usesUserOAuth || Boolean(this.sharedDriveId));
  }

  onModuleInit() {
    this.initDriveClient();
  }

  private readEnvValue(key: string): string | undefined {
    const raw = process.env[key]?.trim();
    if (!raw) return undefined;
    if (
      (raw.startsWith("'") && raw.endsWith("'")) ||
      (raw.startsWith('"') && raw.endsWith('"'))
    ) {
      return raw.slice(1, -1).trim();
    }
    return raw;
  }

  private readServiceAccountJson(): string | null {
    const fromEnv = this.readEnvValue('GOOGLE_DRIVE_CREDENTIALS');
    if (fromEnv) return fromEnv;

    const pathEnv = this.readEnvValue('GOOGLE_DRIVE_CREDENTIALS_PATH');
    if (pathEnv) {
      const filePath = resolve(process.cwd(), pathEnv);
      if (!existsSync(filePath)) {
        this.logger.error(`GOOGLE_DRIVE_CREDENTIALS_PATH file not found: ${filePath}`);
        return null;
      }
      return readFileSync(filePath, 'utf8').trim();
    }

    const defaultPath = resolve(process.cwd(), 'secure', 'google-drive-service-account.json');
    if (existsSync(defaultPath)) {
      return readFileSync(defaultPath, 'utf8').trim();
    }
    return null;
  }

  private tryInitOAuth() {
    const refreshToken = this.readEnvValue('GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN');
    const clientId = this.readEnvValue('GOOGLE_DRIVE_OAUTH_CLIENT_ID');
    const clientSecret = this.readEnvValue('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET');
    if (!refreshToken || !clientId || !clientSecret) return null;

    const redirectUri =
      this.readEnvValue('GOOGLE_DRIVE_OAUTH_REDIRECT_URI') ||
      'http://localhost:3333/oauth2callback';

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
  }

  private initDriveClient() {
    this.rootFolderId = this.readEnvValue('GOOGLE_DRIVE_ROOT_FOLDER_ID');
    this.sharedDriveId = this.readEnvValue('GOOGLE_DRIVE_SHARED_DRIVE_ID');

    const oauth2 = this.tryInitOAuth();
    if (oauth2) {
      this.drive = google.drive({ version: 'v3', auth: oauth2 });
      this.usesUserOAuth = true;
      this.isConfigured = true;
      this.logger.log(
        'Google Drive client initialized (OAuth — uses your Gmail storage; required for personal Google accounts).',
      );
      this.logUploadTarget();
      void this.verifyUploadTarget();
      return;
    }

    const credentialsStr = this.readServiceAccountJson();
    if (!credentialsStr) {
      this.logger.warn(
        'Google Drive not configured. For personal Gmail, set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN (run scripts/google-drive-oauth-setup.mjs). Service accounts only work with Google Workspace Shared drives.',
      );
      return;
    }

    try {
      const credentials = JSON.parse(credentialsStr) as {
        private_key?: string;
        client_email?: string;
      };

      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Service account JSON must include client_email and private_key');
      }

      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [DRIVE_SCOPE],
      });

      this.drive = google.drive({ version: 'v3', auth });
      this.isConfigured = true;
      this.logger.log(`Google Drive client initialized (service account ${credentials.client_email}).`);
      this.logger.warn(
        'Service accounts cannot upload to personal Gmail Drive. Use OAuth credentials or Google Workspace Shared drives.',
      );
      this.logUploadTarget();
      void this.verifyUploadTarget();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to load Google Drive credentials: ${message}`);
    }
  }

  private logUploadTarget(): void {
    if (this.rootFolderId) {
      this.logger.log(`Drive upload root folder: ${this.rootFolderId}`);
    } else if (this.sharedDriveId) {
      this.logger.log(`Drive upload shared drive: ${this.sharedDriveId}`);
    } else if (this.usesUserOAuth) {
      this.logger.warn('Set GOOGLE_DRIVE_ROOT_FOLDER_ID to your "VB Digital ID Cards" folder ID.');
    }
  }

  async uploadFile(
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer,
    folderHierarchy: string[],
  ): Promise<string> {
    if (!this.isConfigured) {
      throw new Error('Google Drive is not configured.');
    }

    if (!this.usesUserOAuth && !this.rootFolderId && !this.sharedDriveId) {
      throw new Error(
        'Configure GOOGLE_DRIVE_ROOT_FOLDER_ID or use OAuth (recommended for Gmail).',
      );
    }

    if (!this.usesUserOAuth && !this.sharedDriveId) {
      throw new Error(
        'Personal Gmail cannot use a service account for uploads. Set GOOGLE_DRIVE_OAUTH_* tokens (see scripts/google-drive-oauth-setup.mjs).',
      );
    }

    try {
      let parentId: string | null;
      let driveFileName = fileName;

      if (this.sharedDriveId || this.usesUserOAuth) {
        parentId = await this.resolveFolderHierarchy(folderHierarchy);
      } else {
        parentId = this.rootFolderId ?? null;
        if (folderHierarchy.length > 0) {
          driveFileName = `${folderHierarchy.join(' - ')} - ${fileName}`;
        }
      }

      if (!parentId) throw new Error('Failed to resolve target folder ID');

      return await this.createFileInParent(driveFileName, mimeType, fileBuffer, parentId);
    } catch (error: unknown) {
      const message = DriveService.formatDriveError(error);
      this.logger.error(`Error uploading file ${fileName} to Google Drive: ${message}`);
      throw new Error(message);
    }
  }

  private static formatDriveError(error: unknown): string {
    if (error && typeof error === 'object') {
      const err = error as {
        message?: string;
        response?: { data?: { error?: { message?: string } } };
        errors?: Array<{ message?: string }>;
      };
      return (
        err.response?.data?.error?.message ||
        err.errors?.[0]?.message ||
        err.message ||
        String(error)
      );
    }
    return String(error);
  }

  private async createFileInParent(
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer,
    parentId: string,
  ): Promise<string> {
    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    const response = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    this.logger.log(`Uploaded ${fileName} to Drive folder ${parentId}. File ID: ${response.data.id}`);
    return response.data.id || '';
  }

  private async verifyUploadTarget(): Promise<void> {
    const folderId = this.rootFolderId ?? this.sharedDriveId;
    if (!folderId) return;

    try {
      const meta = await this.drive.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType,driveId',
        supportsAllDrives: true,
      });
      this.logger.log(`Drive upload target OK: "${meta.data.name}" (${meta.data.id})`);
    } catch (error: unknown) {
      const message = DriveService.formatDriveError(error);
      this.logger.error(`Cannot access Drive folder ${folderId}: ${message}`);
    }
  }

  private driveListParams(extra: drive_v3.Params$Resource$Files$List = {}) {
    return {
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      ...(this.sharedDriveId
        ? { corpora: 'drive' as const, driveId: this.sharedDriveId }
        : {}),
      ...extra,
    };
  }

  private async resolveFolderHierarchy(folders: string[]): Promise<string | null> {
    let currentParentId: string | undefined = this.rootFolderId ?? this.sharedDriveId;

    for (const folderName of folders) {
      const result = await this.getOrCreateFolder(folderName, currentParentId);
      if (!result) return null;
      currentParentId = result;
    }

    return currentParentId ?? null;
  }

  private async getOrCreateFolder(folderName: string, parentId?: string): Promise<string | null> {
    if (!parentId) {
      this.logger.error('Cannot create Drive folder without a parent (set GOOGLE_DRIVE_ROOT_FOLDER_ID).');
      return null;
    }

    const safeName = escapeDriveQueryValue(folderName);
    const query = [
      `mimeType='application/vnd.google-apps.folder'`,
      `name='${safeName}'`,
      `trashed=false`,
      `'${parentId}' in parents`,
    ].join(' and ');

    const res = await this.drive.files.list(
      this.driveListParams({
        q: query,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 1,
      }),
    );

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id || null;
    }

    const createRes = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    return createRes.data.id || null;
  }

  async downloadFile(fileId: string): Promise<Buffer | null> {
    if (!this.isConfigured) return null;

    try {
      const response = await this.drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(response.data as ArrayBuffer);
    } catch (error) {
      this.logger.error(`Error downloading file ${fileId} from Google Drive:`, error);
      return null;
    }
  }
}
