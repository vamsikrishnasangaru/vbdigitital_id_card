import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadsService {
  private uploadDir = path.resolve(process.cwd(), 'uploads');

  constructor() {
    console.log(`[UploadsService] Base upload directory: ${this.uploadDir}`);
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(file: Express.Multer.File, subDir: string = ''): Promise<string> {
    try {
      const dir = path.join(this.uploadDir, subDir);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const ext = path.extname(file.originalname) || '.png';
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
      const filepath = path.join(dir, filename);
      
      if (!file.buffer) {
        throw new Error('File buffer is empty');
      }

      fs.writeFileSync(filepath, file.buffer);
      console.log(`[UploadsService] File saved successfully: ${filepath}`);

      return `/uploads/${subDir ? subDir + '/' : ''}${filename}`;
    } catch (error) {
      console.error('[UploadsService] Error saving file:', error);
      throw error;
    }
  }

  getFilePath(relativePath: string): string {
    return path.join(process.cwd(), relativePath);
  }

  async saveBuffer(buffer: Buffer, subDir: string, filename: string): Promise<string> {
    const dir = path.join(this.uploadDir, subDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filepath = path.join(dir, safeName);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${subDir ? subDir + '/' : ''}${safeName}`;
  }
}
