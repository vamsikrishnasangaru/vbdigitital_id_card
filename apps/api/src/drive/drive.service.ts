import { Injectable, Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);
  private drive: drive_v3.Drive;
  private isConfigured = false;

  isDriveEnabled(): boolean {
    return this.isConfigured;
  }

  constructor() {
    this.initDriveClient();
  }

  private initDriveClient() {
    const credentialsStr = process.env.GOOGLE_DRIVE_CREDENTIALS;
    if (!credentialsStr) {
      this.logger.warn('GOOGLE_DRIVE_CREDENTIALS not provided in .env. Google Drive sync will be disabled.');
      return;
    }

    try {
      const credentials = JSON.parse(credentialsStr);
      
      // Fix for private key newlines when loaded from .env
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      this.drive = google.drive({ version: 'v3', auth });
      this.isConfigured = true;
      this.logger.log('Google Drive client initialized successfully.');
    } catch (error) {
      this.logger.error('Failed to parse GOOGLE_DRIVE_CREDENTIALS JSON string.', error);
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
    folderHierarchy: string[] // e.g., ["VB Digital ID Cards", "School Name", "Class", "Section", "Student Name"]
  ): Promise<string> {
    if (!this.isConfigured) {
      throw new Error(`Skipping upload of ${fileName} — Google Drive not configured.`);
    }

    try {
      const folderId = await this.resolveFolderHierarchy(folderHierarchy);
      if (!folderId) throw new Error('Failed to resolve target folder ID');

      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);

      const response = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: 'id, webViewLink',
      });

      this.logger.log(`Uploaded ${fileName} to Drive. File ID: ${response.data.id}`);
      return response.data.id || '';
    } catch (error: any) {
      this.logger.error(`Error uploading file ${fileName} to Google Drive: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Creates or resolves a nested folder structure returning the leaf folder ID.
   */
  private async resolveFolderHierarchy(folders: string[]): Promise<string | null> {
    let currentParentId: string | undefined = undefined; // Undefined means "root"

    for (const folderName of folders) {
      const result = await this.getOrCreateFolder(folderName, currentParentId);
      if (!result) return null;
      currentParentId = result;
    }

    return currentParentId ?? null;
  }

  private async getOrCreateFolder(folderName: string, parentId?: string): Promise<string | null> {
    const query = [
      `mimeType='application/vnd.google-apps.folder'`,
      `name='${folderName}'`,
      `trashed=false`,
      parentId ? `'${parentId}' in parents` : `'root' in parents`
    ].join(' and ');

    const res = await this.drive.files.list({
      q: query,
      spaces: 'drive',
      fields: 'files(id, name)',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id || null;
    }

    // Folder doesn't exist, create it
    const createRes = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id',
    });
    return createRes.data.id || null;
  }

  async downloadFile(fileId: string): Promise<Buffer | null> {
    if (!this.isConfigured) return null;

    try {
      const response = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      return Buffer.from(response.data as ArrayBuffer);
    } catch (error) {
      this.logger.error(`Error downloading file ${fileId} from Google Drive:`, error);
      return null;
    }
  }
}
