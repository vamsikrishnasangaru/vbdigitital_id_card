import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

@Injectable()
export class DriveService implements OnModuleInit {
  private readonly logger = new Logger(DriveService.name);
  private drive: drive_v3.Drive;
  private isConfigured = false;
  /** Folder in a user’s Drive shared with the service account (Editor). */
  private rootFolderId: string | undefined;
  /** Google Workspace shared drive ID (alternative to root folder). */
  private sharedDriveId: string | undefined;

  isDriveEnabled(): boolean {
    return this.isConfigured;
  }

  onModuleInit() {
    this.initDriveClient();
  }

  /** Normalize .env / PM2 values: trim and strip wrapping quotes. */
  private readCredentialsJson(): string | null {
    const fromEnv = process.env.GOOGLE_DRIVE_CREDENTIALS?.trim();
    if (fromEnv) {
      if (
        (fromEnv.startsWith("'") && fromEnv.endsWith("'")) ||
        (fromEnv.startsWith('"') && fromEnv.endsWith('"'))
      ) {
        return fromEnv.slice(1, -1).trim();
      }
      return fromEnv;
    }

    const pathEnv = process.env.GOOGLE_DRIVE_CREDENTIALS_PATH?.trim();
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
      this.logger.log(`Loading Google Drive credentials from ${defaultPath}`);
      return readFileSync(defaultPath, 'utf8').trim();
    }

    return null;
  }

  private initDriveClient() {
    const credentialsStr = this.readCredentialsJson();
    if (!credentialsStr) {
      this.logger.warn(
        'Google Drive credentials missing. Set GOOGLE_DRIVE_CREDENTIALS, GOOGLE_DRIVE_CREDENTIALS_PATH, or place JSON at secure/google-drive-service-account.json',
      );
      return;
    }

    try {
      const credentials = JSON.parse(credentialsStr) as {
        private_key?: string;
        client_email?: string;
      };

      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('JSON must include client_email and private_key');
      }

      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      this.drive = google.drive({ version: 'v3', auth });
      this.rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || undefined;
      this.sharedDriveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim() || undefined;
      this.isConfigured = true;
      this.logger.log(`Google Drive client initialized (${credentials.client_email}).`);
      if (this.rootFolderId) {
        this.logger.log(`Drive upload root folder: ${this.rootFolderId}`);
      } else if (this.sharedDriveId) {
        this.logger.log(`Drive upload shared drive: ${this.sharedDriveId}`);
      } else {
        this.logger.warn(
          'Set GOOGLE_DRIVE_ROOT_FOLDER_ID (folder in your Drive shared with the service account) or GOOGLE_DRIVE_SHARED_DRIVE_ID. Service accounts cannot store files in their own Drive.',
        );
      }

      void this.verifyUploadTarget();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to load Google Drive credentials: ${message}`);
    }
  }

  /**
   * Uploads a file (PDF or PNG/JPG) to a specific Google Drive folder.
   * If folder doesn't exist, it creates it using the nested hierarchy logic.
   */
  async uploadFile(
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer,
    folderHierarchy: string[] // e.g., ["School Name", "Class", "Section"]
  ): Promise<string> {
    if (!this.isConfigured) {
      throw new Error(`Skipping upload of ${fileName} — Google Drive not configured.`);
    }
    if (!this.rootFolderId && !this.sharedDriveId) {
      throw new Error(
        'Configure GOOGLE_DRIVE_ROOT_FOLDER_ID (share a folder with the service account) or GOOGLE_DRIVE_SHARED_DRIVE_ID.',
      );
    }

    try {
      // Shared drives: nested folders use the shared drive quota.
      // Personal Drive + service account: subfolders created by the SA are SA-owned (no quota).
      // Upload directly into the user-shared root folder with a descriptive filename.
      const parentId = this.sharedDriveId
        ? await this.resolveFolderHierarchy(folderHierarchy)
        : this.rootFolderId;
      if (!parentId) throw new Error('Failed to resolve target folder ID');

      const driveFileName =
        this.sharedDriveId || folderHierarchy.length === 0
          ? fileName
          : `${folderHierarchy.join(' - ')} - ${fileName}`;

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

  /** Confirm the shared root folder is visible to the service account. */
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
      this.logger.error(
        `Cannot access Drive folder ${folderId}. Share it with the service account as Editor. ${message}`,
      );
    }
  }

  /**
   * Creates or resolves a nested folder structure returning the leaf folder ID.
   */
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
      this.logger.error('Cannot create Drive folder without a parent (configure GOOGLE_DRIVE_ROOT_FOLDER_ID).');
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

    // Folder doesn't exist, create it
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
